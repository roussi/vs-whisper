export type DictationMode = "dictate" | "code" | "command";

/**
 * Post-process transcribed text based on the selected dictation mode.
 */
export function postProcess(text: string, mode: DictationMode): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }

  switch (mode) {
    case "dictate":
      return trimmed;
    case "code":
      return cleanForCode(trimmed);
    case "command":
      return formatAsCommand(trimmed);
    default:
      return trimmed;
  }
}

/**
 * Spoken punctuation → symbol mappings.
 * Order matters: longer phrases must come before shorter ones to avoid partial matches.
 * Patterns use loose matching to handle Whisper misspellings (paran/paren, etc.)
 * and surrounding punctuation (.,:; etc.) that Whisper inserts.
 */
const PUNCTUATION_MAP: Array<[RegExp, string]> = [
  // Multi-character operators (must come before single-char ones)
  [/\.?\s*triple equals\s*\.?/gi, "==="],
  [/\.?\s*strict equals\s*\.?/gi, "==="],
  [/\.?\s*double equals\s*\.?/gi, "=="],
  [/\.?\s*not equals?\s*\.?/gi, "!="],
  [/\.?\s*bang equals\s*\.?/gi, "!="],
  [/\.?\s*fat arrow\s*\.?/gi, " => "],
  [/\.?\s*arrow\s*\.?/gi, " => "],

  // Parentheses — handle misspellings: paren, paran, parin, parren, parran
  [/\.?\s*open\s+par[ae][ni](?:thesis)?\.?\s*/gi, "("],
  [/\.?\s*left\s+par[ae][ni](?:thesis)?\.?\s*/gi, "("],
  [/\.?\s*close\s+par[ae][ni](?:thesis)?\.?\s*/gi, ")"],
  [/\.?\s*right\s+par[ae][ni](?:thesis)?\.?\s*/gi, ")"],

  // Brackets
  [/\.?\s*open\s+bracket\.?\s*/gi, "["],
  [/\.?\s*left\s+bracket\.?\s*/gi, "["],
  [/\.?\s*close\s+bracket\.?\s*/gi, "]"],
  [/\.?\s*right\s+bracket\.?\s*/gi, "]"],

  // Braces
  [/\.?\s*open\s+(?:brace|curly)\.?\s*/gi, "{"],
  [/\.?\s*left\s+(?:brace|curly)\.?\s*/gi, "{"],
  [/\.?\s*close\s+(?:brace|curly)\.?\s*/gi, "}"],
  [/\.?\s*right\s+(?:brace|curly)\.?\s*/gi, "}"],

  // Single punctuation
  [/\.?\s*(?:period|full stop)\.?\s*/gi, "."],
  [/\.?\s*comma\.?\s*/gi, ", "],
  [/\.?\s*(?:semicolon|semi\s*colon)\.?\s*/gi, ";"],
  [/\.?\s*colon\.?\s*/gi, ":"],

  // Operators
  [/\.?\s*(?:equals|equal sign)\.?\s*/gi, " = "],
  [/\.?\s*(?:dash|hyphen|minus)\.?\s*/gi, "-"],
  [/\.?\s*plus\.?\s*/gi, " + "],
  [/\.?\s*(?:asterisk|star|times)\.?\s*/gi, "*"],
  [/\.?\s*(?:forward\s+slash|slash)\.?\s*/gi, "/"],
  [/\.?\s*(?:backslash|back\s*slash)\.?\s*/gi, "\\"],
  [/\.?\s*pipe\.?\s*/gi, "|"],
  [/\.?\s*(?:ampersand|and sign)\.?\s*/gi, "&"],
  [/\.?\s*(?:exclamation|bang)\.?\s*/gi, "!"],
  [/\.?\s*question\s+mark\.?\s*/gi, "?"],
  [/\.?\s*(?:at sign|at symbol)\.?\s*/gi, "@"],
  [/\.?\s*(?:hash|pound sign|hashtag)\.?\s*/gi, "#"],
  [/\.?\s*dollar sign\.?\s*/gi, "$"],
  [/\.?\s*percent\.?\s*/gi, "%"],
  [/\.?\s*(?:caret|hat)\.?\s*/gi, "^"],
  [/\.?\s*tilde\.?\s*/gi, "~"],
  [/\.?\s*(?:backtick|back\s*tick)\.?\s*/gi, "`"],
  [/\.?\s*underscore\.?\s*/gi, "_"],
  [/\.?\s*new\s+line\.?\s*/gi, "\n"],
];

/**
 * Code mode: clean up filler words, normalize punctuation for code context.
 */
function cleanForCode(text: string): string {
  let result = text;

  // Remove common filler words
  result = result.replace(
    /\b(um+|uh+|ah+|eh+|er+|like|you know|basically|actually|so yeah|i mean)\b/gi,
    ""
  );

  // Apply spoken punctuation → symbol replacements
  for (const [pattern, replacement] of PUNCTUATION_MAP) {
    result = result.replace(pattern, replacement);
  }

  // Handle "tab" separately (common word, only replace when standalone)
  result = result.replace(/(?:^|\s)tab(?:\s|$)/gi, "\t");

  // Normalize code keywords to lowercase
  result = result
    .replace(/\bstring\b/gi, "string")
    .replace(/\bnumber\b/gi, "number")
    .replace(/\bboolean\b/gi, "boolean")
    .replace(/\bnull\b/gi, "null")
    .replace(/\bundefined\b/gi, "undefined")
    .replace(/\btrue\b/gi, "true")
    .replace(/\bfalse\b/gi, "false");

  // Clean up extra spaces and trim
  result = result.replace(/\s{2,}/g, " ").trim();

  return result;
}

/**
 * Command mode: format speech as a clear coding instruction/prompt.
 */
function formatAsCommand(text: string): string {
  let result = text;

  // Remove filler words
  result = result.replace(
    /\b(um+|uh+|ah+|eh+|er+|like|you know|basically|actually|so yeah|i mean)\b/gi,
    ""
  );

  // Clean up
  result = result.replace(/\s{2,}/g, " ").trim();

  // Capitalize first letter
  if (result.length > 0) {
    result = result.charAt(0).toUpperCase() + result.slice(1);
  }

  // Ensure it ends with a period if no punctuation
  if (result && !/[.!?]$/.test(result)) {
    result += ".";
  }

  return result;
}
