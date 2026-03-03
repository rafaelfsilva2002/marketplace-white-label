interface SanitizeResult {
  sanitized: string;
  replacements: Map<string, string>;
}

interface PiiPattern {
  name: string;
  regex: RegExp;
  placeholder: string;
}

const PII_PATTERNS: PiiPattern[] = [
  {
    name: 'CPF',
    regex: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g,
    placeholder: '[CPF_REDACTED]',
  },
  {
    name: 'CARD',
    regex: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    placeholder: '[CARD_REDACTED]',
  },
  {
    name: 'PHONE',
    regex: /\+55\s?\(?\d{2}\)?\s?\d{4,5}-?\d{4}\b/g,
    placeholder: '[PHONE_REDACTED]',
  },
  {
    name: 'EMAIL',
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    placeholder: '[EMAIL_REDACTED]',
  },
];

export class PiiSanitizer {
  private readonly patterns: PiiPattern[];

  constructor(customPatterns?: PiiPattern[]) {
    this.patterns = customPatterns ?? PII_PATTERNS;
  }

  sanitize(text: string): SanitizeResult {
    const replacements = new Map<string, string>();
    let sanitized = text;
    let counter = 0;

    for (const pattern of this.patterns) {
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      sanitized = sanitized.replace(regex, (match) => {
        counter++;
        const token = `${pattern.placeholder.slice(0, -1)}_${counter}]`;
        replacements.set(token, match);
        return token;
      });
    }

    return { sanitized, replacements };
  }

  restore(text: string, replacements: Map<string, string>): string {
    let restored = text;

    for (const [token, original] of replacements.entries()) {
      restored = restored.split(token).join(original);
    }

    return restored;
  }
}
