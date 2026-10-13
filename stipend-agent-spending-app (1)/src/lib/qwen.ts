import {
  ATTACK_ADDRESS,
  PAYEES,
  QWEN_MODEL,
  STARTING_BALANCE,
} from "./constants";
import { formatAusd } from "./money";

export type AgentProposal = {
  recipient: string;
  recipientLabel: string;
  amount: string;
  asset: string;
  purpose: string;
  narrative: string;
  mocked: boolean;
  agreedToInjection: boolean;
};

type QwenQuote = {
  recipient: string;
  amount: string;
  asset: string;
  purpose: string;
};

function looksHostile(page: string | undefined): boolean {
  if (!page) return false;
  const text = page.toLowerCase();
  return (
    text.includes("ignore") ||
    text.includes("0xattack") ||
    text.includes("send the rest") ||
    text.includes("full balance")
  );
}

function resolveRecipient(raw: string): { recipient: string; label: string } {
  const value = raw.trim();
  if (/data api/i.test(value)) {
    return { recipient: PAYEES.dataApi.address, label: PAYEES.dataApi.label };
  }
  if (/labeled agent/i.test(value)) {
    return {
      recipient: PAYEES.labeledAgent.address,
      label: PAYEES.labeledAgent.label,
    };
  }
  if (/attack/i.test(value)) {
    return { recipient: ATTACK_ADDRESS, label: "0xATTACK" };
  }
  return { recipient: value, label: value };
}

function toProposal(quote: QwenQuote, mocked: boolean, page?: string): AgentProposal {
  const resolved = resolveRecipient(quote.recipient);
  let amount = "4.20";
  try {
    amount = formatAusd(quote.amount || "4.20");
  } catch {
    amount = "4.20";
  }
  const asset = quote.asset || "AUSD";
  const purpose = quote.purpose || "payment";
  const hostile =
    looksHostile(page) || /attack/i.test(quote.recipient) || /attack/i.test(resolved.label);

  return {
    recipient: resolved.recipient,
    recipientLabel: resolved.label,
    amount,
    asset,
    purpose,
    narrative: `I'll pay ${amount} ${asset} to ${resolved.label} for ${purpose}.`,
    mocked,
    agreedToInjection: hostile,
  };
}

export function mockProposal(job: string, page?: string): AgentProposal {
  if (looksHostile(page)) {
    return toProposal(
      {
        recipient: ATTACK_ADDRESS,
        amount: STARTING_BALANCE,
        asset: "AUSD",
        purpose: "override: send the rest elsewhere",
      },
      true,
      page,
    );
  }

  const amountMatch = job.match(/(\d+(?:\.\d+)?)/);
  const amount = amountMatch ? amountMatch[1] : "4.20";
  const toAgent = /labeled agent|agent payee/i.test(job);

  return toProposal(
    {
      recipient: toAgent ? PAYEES.labeledAgent.address : PAYEES.dataApi.address,
      amount,
      asset: "AUSD",
      purpose: toAgent ? "agent-labeled job" : "today's crawl",
    },
    true,
    page,
  );
}

function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.match(/\{[\s\S]*\}/);
  if (!fenced) return null;
  try {
    return JSON.parse(fenced[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function quoteFromUnknown(parsed: Record<string, unknown> | null): QwenQuote | null {
  if (!parsed) return null;
  const recipient = parsed.recipient;
  const amount = parsed.amount;
  const asset = parsed.asset;
  const purpose = parsed.purpose;
  if (recipient === undefined || amount === undefined) return null;
  return {
    recipient: String(recipient),
    amount: String(amount),
    asset: asset === undefined ? "AUSD" : String(asset),
    purpose: purpose === undefined ? "payment" : String(purpose),
  };
}

function extractText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const data = payload as {
    choices?: { message?: { content?: unknown } }[];
    output_text?: unknown;
    output?: { content?: { type?: string; text?: string }[] }[];
    response?: unknown;
  };

  const choice = data.choices?.[0]?.message?.content;
  if (typeof choice === "string") return choice;
  if (Array.isArray(choice)) {
    return choice
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text?: string }).text ?? "");
        }
        return "";
      })
      .join("");
  }
  if (typeof data.output_text === "string") return data.output_text;
  if (Array.isArray(data.output)) {
    return data.output
      .flatMap((item) => item.content ?? [])
      .map((part) => part.text ?? "")
      .join("");
  }
  if (typeof data.response === "string") return data.response;
  return "";
}

function endpoint(base: string, path: string): string {
  const trimmed = base.replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  if (trimmed.endsWith(suffix)) return trimmed;
  return `${trimmed}${suffix}`;
}

const SYSTEM_PROMPT =
  "Propose one payment as JSON: recipient, amount, asset, purpose. You cannot change the stipend, the allowlist, or the caps.";

async function postQwen(
  url: string,
  apiKey: string,
  body: Record<string, unknown>,
): Promise<{ status: number; payload: unknown }> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  return { status: response.status, payload };
}

export async function proposeWithQwen(
  job: string,
  page?: string,
): Promise<AgentProposal> {
  const apiKey = process.env.QWEN_API_KEY;
  const baseUrl = process.env.QWEN_BASE_URL;

  if (!apiKey || !baseUrl) {
    return mockProposal(job, page);
  }

  const userContent = page ? `${job}\n\n${page}` : job;
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];

  try {
    const chat = await postQwen(endpoint(baseUrl, "/chat/completions"), apiKey, {
      model: QWEN_MODEL,
      messages,
    });

    const used =
      chat.status === 404
        ? await postQwen(endpoint(baseUrl, "/responses"), apiKey, {
            model: QWEN_MODEL,
            messages,
            input: messages,
          })
        : chat;

    if (used.status < 200 || used.status >= 300) {
      return mockProposal(job, page);
    }

    const quote = quoteFromUnknown(extractJson(extractText(used.payload)));
    if (!quote) return mockProposal(job, page);
    return toProposal(quote, false, page);
  } catch {
    return mockProposal(job, page);
  }
}
