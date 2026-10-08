export interface RedactionOptions {
  personalData?: boolean;
  cpf?: boolean;
  cnpj?: boolean;
  email?: boolean;
  phone?: boolean;
}
export interface RedactionResult { content: string; redactionCount: number }

const replacement = "[OCULTO]";
const credentialNames = "authorization|proxy[-_ ]?authorization|cookie|set[-_ ]?cookie|ocp[-_ ]?apim[-_ ]?subscription[-_ ]?key|x[-_ ]?functions[-_ ]?key|client[-_ ]?secret|client[-_ ]?assertion|password|passwd|pwd|secret|access[-_ ]?token|refresh[-_ ]?token|id[-_ ]?token|token|api[-_ ]?key|subscription[-_ ]?key|connection[-_ ]?string|account[-_ ]?key|shared[-_ ]?access[-_ ]?key|shared[-_ ]?access[-_ ]?signature|signature|sig|sas[-_ ]?token|private[-_ ]?key";
const sensitiveKey = new RegExp(`^(?:${credentialNames})$`, "i");

function isSensitiveKey(key: string): boolean {
  return sensitiveKey.test(key) || /(?:connectionstring|clientsecret|privatekey|apikey|accesstoken|refreshtoken)$/i.test(key.replace(/[-_ .]/g, ""));
}

/** A sanitização usa uma cópia e mantém o original disponível para a análise local. */
export function redactContent(content: string, options: RedactionOptions = {}): RedactionResult {
  let redactionCount = 0;
  const hide = (value: string): string => {
    if (!value || [replacement, `"${replacement}"`, `'${replacement}'`, `\\"${replacement}\\"`, `\\'${replacement}\\'`].includes(value.trim())) return value;
    redactionCount += 1;
    return replacement;
  };
  const replaceMatches = (text: string, pattern: RegExp): string => text.replace(pattern, (value: string) => hide(value));

  function redactText(text: string): string {
    let result = text;
    // Um header textual ocupa a linha inteira, inclusive cookies com valores citados.
    result = result.replace(/\b((?:authorization|proxy-authorization|cookie|set-cookie)\s*[:=]\s*)([^\r\n]*)/gi, (_match: string, prefix: string, value: string) => `${prefix}${hide(value.trim())}`);
    // Chaves citadas também aparecem em JSON escapado copiado do Run History.
    const quoted = new RegExp(`((?:\\\\?["'])?(?:${credentialNames})(?:\\\\?["'])?\\s*[:=]\\s*)(\\\\?["'])`, "gi");
    let quotedResult = "";
    let cursor = 0;
    let match: RegExpExecArray | null;
    while ((match = quoted.exec(result)) !== null) {
      const opening = match[2];
      const start = quoted.lastIndex;
      let end = start;
      let closed = false;
      while (end < result.length && !/[\r\n]/.test(result[end])) {
        if (result.startsWith(opening, end)) { closed = true; break; }
        if (result[end] === "\\") end += 2;
        else end += 1;
      }
      quotedResult += result.slice(cursor, match.index) + match[1] + opening + hide(result.slice(start, end)) + (closed ? opening : "");
      cursor = end + (closed ? opening.length : 0);
      quoted.lastIndex = cursor;
    }
    result = quotedResult + result.slice(cursor);
    // Valores não citados de connection strings terminam no separador, não no espaço.
    result = result.replace(/(\b(?:password|passwd|pwd|account[-_ ]?key|shared[-_ ]?access[-_ ]?key)\s*=\s*)([^;&\r\n]*)/gi, (_match: string, prefix: string, value: string) => `${prefix}${hide(value.trim())}`);
    const plain = new RegExp(`(\\b(?:${credentialNames})\\s*[:=]\\s*)([^\\s;,&"'\\\\<>}]+)`, "gi");
    result = result.replace(plain, (_match: string, prefix: string, value: string) => `${prefix}${hide(value)}`);
    const query = /([?&])([^=&#\s"'\\]+)=([^&#\s"'\\]*)/gi;
    result = result.replace(query, (match: string, separator: string, name: string, value: string) => {
      let decodedName = name;
      try { decodedName = decodeURIComponent(name); } catch { /* Parâmetro malformado continua sujeito às regras textuais. */ }
      return isSensitiveKey(decodedName) || /^(code|sas)$/i.test(decodedName) ? `${separator}${name}=${hide(value)}` : match;
    });
    result = result.replace(/(https?:\/\/)([^\s/@:]+):([^\s/@]+)@/gi, (_match: string, protocol: string, user: string, password: string) => `${protocol}${user}:${hide(password)}@`);
    result = result.replace(/\b(Bearer|Basic)\s+([^\s"'\\,;]+)/gi, (_match: string, scheme: string, token: string) => `${scheme} ${hide(token)}`);
    result = replaceMatches(result, /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g);
    result = replaceMatches(result, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g);
    result = replaceMatches(result, /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g);
    if (options.personalData || options.cnpj) result = replaceMatches(result, /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g);
    if (options.personalData || options.cpf) result = replaceMatches(result, /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g);
    if (options.personalData || options.email) result = replaceMatches(result, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi);
    if (options.personalData || options.phone) result = replaceMatches(result, /(?:\+?55[\s-]?)?(?:\(\d{2}\)|\b\d{2})[\s-]?9?\d{4}[\s-]?\d{4}\b/g);
    return result;
  }

  function visit(value: unknown, depth: number): unknown {
    if (depth > 100) return hide("Limite de profundidade excedido");
    if (Array.isArray(value)) return value.map((item: unknown) => visit(item, depth + 1));
    if (value !== null && typeof value === "object") {
      const record = value as Record<string, unknown>;
      const secureValue = typeof record.type === "string" && /^securestring|secureobject$/i.test(record.type);
      return Object.fromEntries(Object.entries(record).map(([key, item]) => {
        const personalKey = (options.personalData || options.cpf) && /^cpf$/i.test(key)
          || (options.personalData || options.cnpj) && /^cnpj$/i.test(key)
          || (options.personalData || options.email) && /^e[-_]?mail$/i.test(key)
          || (options.personalData || options.phone) && /^(phone(?:number)?|telefone|celular)$/i.test(key);
        if (isSensitiveKey(key) || personalKey || (secureValue && /^(value|defaultValue)$/i.test(key))) {
          if (item === null || item === "") return [key, item];
          return [key, hide(typeof item === "string" ? item : JSON.stringify(item))];
        }
        return [key, visit(item, depth + 1)];
      }));
    }
    if (typeof value === "string") {
      const trimmed = value.trimStart();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try { return JSON.stringify(visit(JSON.parse(value) as unknown, depth + 1)); } catch { /* O texto continua sendo sanitizado se não for JSON. */ }
      }
      return redactText(value);
    }
    return value;
  }

  let sanitized: string;
  try {
    const parsed: unknown = JSON.parse(content);
    sanitized = JSON.stringify(visit(parsed, 0), null, 2);
  } catch {
    sanitized = redactText(content);
  }
  return { content: sanitized, redactionCount };
}
