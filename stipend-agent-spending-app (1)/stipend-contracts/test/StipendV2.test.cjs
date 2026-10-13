const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const solc = require('solc');
const ganache = require('ganache');
const { createPublicClient, createWalletClient, custom, parseUnits } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');

const U = (value) => parseUnits(String(value), 6);
const sources = ['StipendV2.sol', 'MockAUSD.sol'];
const input = {
  language: 'Solidity',
  sources: Object.fromEntries(sources.map((file) => [file, { content: fs.readFileSync(path.join(__dirname, '../src', file), 'utf8') }])),
  settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'paris', outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } },
};
const compiled = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (compiled.errors || []).filter((e) => e.severity === 'error');
assert.equal(errors.length, 0, errors.map((e) => e.formattedMessage).join('\n'));
const tokenArtifact = compiled.contracts['MockAUSD.sol'].MockAUSD;
const stipendArtifact = compiled.contracts['StipendV2.sol'].StipendV2;

async function fixture({ total = 20, daily = 20 } = {}) {
  const provider = ganache.provider({ logging: { quiet: true }, chain: { chainId: 10143, hardfork: 'shanghai' }, wallet: { totalAccounts: 8, defaultBalance: 100 } });
  const transport = custom(provider);
  const publicClient = createPublicClient({ transport });
  const keys = Object.values(provider.getInitialAccounts()).map(({ secretKey }) => privateKeyToAccount(secretKey));
  const [deployer, owner, agent, payeeA, payeeB, attacker] = keys;
  const wallets = keys.map((account) => createWalletClient({ transport, account }));
  const [deployerWallet, ownerWallet, agentWallet, , , attackerWallet] = wallets;
  const deploy = async (wallet, artifact, args = []) => {
    const hash = await wallet.deployContract({ abi: artifact.abi, bytecode: `0x${artifact.evm.bytecode.object}`, args, gas: 6000000n });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, 'success');
    return receipt.contractAddress;
  };
  const token = await deploy(deployerWallet, tokenArtifact);
  const stipend = await deploy(deployerWallet, stipendArtifact, [owner.address, token, agent.address, payeeA.address, payeeB.address, U(total), U(2), U(Math.min(daily, total)), 3n]);
  const call = async (wallet, address, artifact, functionName, args = []) => {
    const hash = await wallet.writeContract({ address, abi: artifact.abi, functionName, args, gas: 700000n });
    return publicClient.waitForTransactionReceipt({ hash });
  };
  const ok = async (wallet, address, artifact, functionName, args = []) => {
    const receipt = await call(wallet, address, artifact, functionName, args);
    assert.equal(receipt.status, 'success', `${functionName} should succeed`);
  };
  const rejected = async (wallet, address, artifact, functionName, args = []) => {
    try {
      const receipt = await call(wallet, address, artifact, functionName, args);
      assert.equal(receipt.status, 'reverted', `${functionName} should revert`);
    } catch (e) {
      if (e.name === 'AssertionError') throw e;
      assert.match(String(e), /revert|rejected|failed|not allowed|exceeds|execution/i);
    }
  };
  const read = (address, artifact, functionName, args = []) => publicClient.readContract({ address, abi: artifact.abi, functionName, args });
  await ok(deployerWallet, token, tokenArtifact, 'mint', [owner.address, U(20)]);
  await ok(ownerWallet, token, tokenArtifact, 'approve', [stipend, U(20)]);
  await ok(ownerWallet, stipend, stipendArtifact, 'fund', [U(total)]);
  const pay = (to, amount, nonce, wallet = agentWallet) => call(wallet, stipend, stipendArtifact, 'pay', [to, U(amount), BigInt(nonce)]);
  return { provider, publicClient, wallets, deployerWallet, ownerWallet, agentWallet, attackerWallet, deployer, owner, agent, payeeA, payeeB, attacker, token, stipend, read, call, ok, rejected, pay };
}

test('V2 local escrow and authorization', async (t) => {
  await t.test('authorized payment within all limits succeeds', async () => {
    const f = await fixture();
    assert.equal((await f.pay(f.payeeA.address, 1, 1)).status, 'success');
    assert.equal(await f.read(f.stipend, stipendArtifact, 'spent'), U(1));
    assert.equal(await f.read(f.token, tokenArtifact, 'balanceOf', [f.payeeA.address]), U(1));
  });
  await t.test('unauthorized caller cannot pay', async () => {
    const f = await fixture();
    await f.rejected(f.attackerWallet, f.stipend, stipendArtifact, 'pay', [f.payeeA.address, U(1), 1n]);
  });
  await t.test('unapproved recipient cannot be paid', async () => {
    const f = await fixture();
    await f.rejected(f.agentWallet, f.stipend, stipendArtifact, 'pay', [f.attacker.address, U(1), 1n]);
  });
  await t.test('above per-payment limit is rejected', async () => {
    const f = await fixture();
    await f.rejected(f.agentWallet, f.stipend, stipendArtifact, 'pay', [f.payeeA.address, U(3), 1n]);
  });
  await t.test('remaining total budget cannot be exceeded', async () => {
    const f = await fixture({ total: 2 });
    await f.pay(f.payeeA.address, 1.5, 1);
    await f.rejected(f.agentWallet, f.stipend, stipendArtifact, 'pay', [f.payeeA.address, U(1), 2n]);
  });
  await t.test('daily cap rejects excess', async () => {
    const f = await fixture({ daily: 2 });
    await f.pay(f.payeeA.address, 1.5, 1);
    await f.rejected(f.agentWallet, f.stipend, stipendArtifact, 'pay', [f.payeeB.address, U(1), 2n]);
  });
  await t.test('fourth payment in an hour rejected', async () => {
    const f = await fixture();
    for (let i = 1; i <= 3; i++) assert.equal((await f.pay(f.payeeA.address, 1, i)).status, 'success');
    await f.rejected(f.agentWallet, f.stipend, stipendArtifact, 'pay', [f.payeeA.address, U(1), 4n]);
  });
  await t.test('quote replay rejected', async () => {
    const f = await fixture();
    await f.pay(f.payeeA.address, 1, 1);
    await f.rejected(f.agentWallet, f.stipend, stipendArtifact, 'pay', [f.payeeA.address, U(1), 1n]);
  });
  await t.test('revocation stops agent payments; owner recovers remaining escrow', async () => {
    const f = await fixture();
    await f.ok(f.ownerWallet, f.stipend, stipendArtifact, 'revoke');
    await f.rejected(f.agentWallet, f.stipend, stipendArtifact, 'pay', [f.payeeA.address, U(1), 1n]);
    await f.ok(f.ownerWallet, f.stipend, stipendArtifact, 'recover', [f.owner.address]);
    assert.equal(await f.read(f.token, tokenArtifact, 'balanceOf', [f.stipend]), 0n);
  });
  await t.test('token transfer failure rolls back all counters and quote use', async () => {
    const f = await fixture();
    await f.ok(f.deployerWallet, f.token, tokenArtifact, 'setFailTransfers', [true]);
    await f.rejected(f.agentWallet, f.stipend, stipendArtifact, 'pay', [f.payeeA.address, U(1), 1n]);
    assert.equal(await f.read(f.stipend, stipendArtifact, 'spent'), 0n);
    assert.equal(await f.read(f.stipend, stipendArtifact, 'daySpent'), 0n);
    assert.equal(await f.read(f.stipend, stipendArtifact, 'hourCount'), 0n);
    const hash = await f.read(f.stipend, stipendArtifact, 'hashQuote', [f.payeeA.address, U(1), 1n]);
    assert.equal(await f.read(f.stipend, stipendArtifact, 'usedQuote', [hash]), false);
  });
  await t.test('designated passkey owner, not deployer, controls revoke and payees', async () => {
    const f = await fixture();
    assert.equal(await f.read(f.stipend, stipendArtifact, 'owner'), f.owner.address);
    await f.rejected(f.deployerWallet, f.stipend, stipendArtifact, 'revoke');
    await f.ok(f.ownerWallet, f.stipend, stipendArtifact, 'setPayees', [f.payeeA.address, f.attacker.address]);
    assert.equal(await f.read(f.stipend, stipendArtifact, 'payeeB'), f.attacker.address);
  });
  await t.test('agent cannot bypass caps by transferring escrow tokens directly', async () => {
    const f = await fixture();
    await f.rejected(f.agentWallet, f.token, tokenArtifact, 'transferFrom', [f.stipend, f.attacker.address, U(1)]);
    assert.equal(await f.read(f.token, tokenArtifact, 'balanceOf', [f.stipend]), U(20));
    assert.equal(await f.read(f.token, tokenArtifact, 'balanceOf', [f.agent.address]), 0n);
  });
});
