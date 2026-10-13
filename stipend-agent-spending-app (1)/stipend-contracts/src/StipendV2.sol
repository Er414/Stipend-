// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IStipendToken {
    function balanceOf(address holder) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @notice Escrowed, passkey-owned stipend. The agent only supplies proposals and pays via this contract.
/// @dev No external library dependency; uses safe low-level ERC20 transfers and a non-reentrant guard.
contract StipendV2 {
    address public immutable owner;
    address public agent;
    IStipendToken public immutable ausd;
    address public payeeA;
    address public payeeB;
    uint256 public immutable totalCap;
    uint256 public immutable perPaymentCap;
    uint256 public immutable dailyCap;
    uint256 public immutable maxPerHour;
    uint256 public spent;
    uint256 public daySpent;
    uint256 public dayStart;
    uint256 public hourCount;
    uint256 public hourStart;
    bool public revoked;
    bool private entered;
    mapping(bytes32 => bool) public usedQuote;

    event Funded(address indexed from, uint256 amount);
    event Paid(bytes32 indexed quoteHash, address indexed to, uint256 amount);
    event Revoked(address indexed by);
    event Recovered(address indexed to, uint256 amount);
    event AgentChanged(address indexed previous, address indexed next);
    event PayeesChanged(address indexed payeeA, address indexed payeeB);
    // Failed transactions revert atomically; EVM drops logs from reverted transactions.
    // Rejected attempts must be logged by the caller/indexer off-chain.

    modifier onlyOwner() { require(msg.sender == owner, "owner"); _; }
    modifier nonReentrant() {
        require(!entered, "reentrant");
        entered = true;
        _;
        entered = false;
    }

    constructor(
        address owner_, address token_, address agent_, address payeeA_, address payeeB_,
        uint256 totalCap_, uint256 perPaymentCap_, uint256 dailyCap_, uint256 maxPerHour_
    ) {
        require(owner_ != address(0) && token_ != address(0) && agent_ != address(0), "zero address");
        require(payeeA_ != address(0) && payeeB_ != address(0) && payeeA_ != payeeB_, "payees");
        require(totalCap_ > 0 && perPaymentCap_ > 0 && dailyCap_ > 0 && maxPerHour_ > 0, "limits");
        require(perPaymentCap_ <= totalCap_ && dailyCap_ <= totalCap_, "caps");
        owner = owner_;
        ausd = IStipendToken(token_);
        agent = agent_;
        payeeA = payeeA_;
        payeeB = payeeB_;
        totalCap = totalCap_;
        perPaymentCap = perPaymentCap_;
        dailyCap = dailyCap_;
        maxPerHour = maxPerHour_;
        dayStart = block.timestamp;
        hourStart = block.timestamp;
    }

    function setAgent(address next) external onlyOwner {
        require(next != address(0) && !revoked, "agent");
        emit AgentChanged(agent, next);
        agent = next;
    }

    function setPayees(address nextA, address nextB) external onlyOwner {
        require(!revoked && nextA != address(0) && nextB != address(0) && nextA != nextB, "payees");
        payeeA = nextA;
        payeeB = nextB;
        emit PayeesChanged(nextA, nextB);
    }

    /// @notice Owner supplies tokens to escrow. Fundings cannot exceed the unspent budget.
    function fund(uint256 amount) external onlyOwner nonReentrant {
        require(!revoked && amount > 0, "funding disabled");
        uint256 beforeBalance = ausd.balanceOf(address(this));
        require(beforeBalance + amount <= totalCap - spent, "budget");
        _safeTransferFrom(address(ausd), msg.sender, address(this), amount);
        require(ausd.balanceOf(address(this)) == beforeBalance + amount, "token delta");
        emit Funded(msg.sender, amount);
    }

    /// @dev Quote locks chain, contract, recipient, amount and a caller-selected nonce.
    function hashQuote(address to, uint256 amount, uint256 nonce) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), address(ausd), to, amount, nonce));
    }

    function pay(address to, uint256 amount, uint256 nonce) external nonReentrant returns (bool) {
        require(msg.sender == agent, "agent");
        require(!revoked, "revoked");
        require(to == payeeA || to == payeeB, "allowlist");
        require(amount > 0 && amount <= perPaymentCap, "per-payment");
        require(amount <= totalCap - spent, "total");
        require(ausd.balanceOf(address(this)) >= amount, "escrow");
        bytes32 quoteHash = hashQuote(to, amount, nonce);
        require(!usedQuote[quoteHash], "quote");
        if (block.timestamp >= dayStart + 1 days) {
            dayStart = block.timestamp;
            daySpent = 0;
        }
        require(daySpent + amount <= dailyCap, "daily");
        if (block.timestamp >= hourStart + 1 hours) {
            hourStart = block.timestamp;
            hourCount = 0;
        }
        require(hourCount < maxPerHour, "hourly");
        usedQuote[quoteHash] = true;
        spent += amount;
        daySpent += amount;
        hourCount += 1;
        uint256 beforeBalance = ausd.balanceOf(address(this));
        _safeTransfer(address(ausd), to, amount);
        require(ausd.balanceOf(address(this)) == beforeBalance - amount, "token delta");
        emit Paid(quoteHash, to, amount);
        return true;
    }

    function revoke() external onlyOwner {
        require(!revoked, "revoked");
        revoked = true;
        emit Revoked(msg.sender);
    }

    function recover(address to) external onlyOwner nonReentrant {
        require(revoked && to != address(0), "recover");
        uint256 balance = ausd.balanceOf(address(this));
        require(balance > 0, "empty");
        _safeTransfer(address(ausd), to, balance);
        emit Recovered(to, balance);
    }

    function _safeTransfer(address token, address to, uint256 amount) private {
        (bool ok, bytes memory data) = token.call(abi.encodeWithSelector(IStipendToken.transfer.selector, to, amount));
        require(ok && (data.length == 0 || (data.length == 32 && abi.decode(data, (bool)))), "transfer failed");
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) private {
        (bool ok, bytes memory data) = token.call(abi.encodeWithSelector(IStipendToken.transferFrom.selector, from, to, amount));
        require(ok && (data.length == 0 || (data.length == 32 && abi.decode(data, (bool)))), "transferFrom failed");
    }
}
