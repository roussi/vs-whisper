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
 * Code mode: clean up filler words, normalize punctuation for code context.
 */
function cleanForCode(text: string): string {
  let result = text;

  // Remove common filler words
  const fillers = [
    /\b(um+|uh+|ah+|eh+|er+|like|you know|basically|actually|so yeah|i mean)\b/gi,
  ];
  for (const filler of fillers) {
    result = result.replace(filler, "");
  }

  // Normalize spoken punctuation to symbols
  result = result
    .replace(/\b(period|full stop)\b/gi, ".")
    .replace(/\bcomma\b/gi, ",")
    .replace(/\b(semicolon|semi colon)\b/gi, ";")
    .replace(/\bcolon\b/gi, ":")
    .replace(/\b(open paren|left paren|open parenthesis)\b/gi, "(")
    .replace(/\b(close paren|right paren|close parenthesis)\b/gi, ")")
    .replace(/\b(open bracket|left bracket)\b/gi, "[")
    .replace(/\b(close bracket|right bracket)\b/gi, "]")
    .replace(/\b(open brace|left brace|open curly)\b/gi, "{")
    .replace(/\b(close brace|right brace|close curly)\b/gi, "}")
    .replace(/\b(equals|equal sign)\b/gi, "=")
    .replace(/\b(double equals)\b/gi, "==")
    .replace(/\b(triple equals|strict equals)\b/gi, "===")
    .replace(/\b(not equals?|bang equals)\b/gi, "!=")
    .replace(/\b(arrow|fat arrow)\b/gi, "=>")
    .replace(/\b(dash|hyphen|minus)\b/gi, "-")
    .replace(/\b(plus)\b/gi, "+")
    .replace(/\b(asterisk|star|times)\b/gi, "*")
    .replace(/\b(forward slash|slash)\b/gi, "/")
    .replace(/\b(backslash|back slash)\b/gi, "\\")
    .replace(/\b(pipe)\b/gi, "|")
    .replace(/\b(ampersand|and sign)\b/gi, "&")
    .replace(/\b(exclamation|bang)\b/gi, "!")
    .replace(/\b(question mark)\b/gi, "?")
    .replace(/\b(at sign|at symbol)\b/gi, "@")
    .replace(/\b(hash|pound sign|hashtag)\b/gi, "#")
    .replace(/\b(dollar sign)\b/gi, "$")
    .replace(/\b(percent)\b/gi, "%")
    .replace(/\b(caret|hat)\b/gi, "^")
    .replace(/\b(tilde)\b/gi, "~")
    .replace(/\b(backtick|back tick)\b/gi, "`")
    .replace(/\b(underscore)\b/gi, "_")
    .replace(/\bnew line\b/gi, "\n")
    .replace(/\btab\b/gi, "\t");

  // Spoken code keywords
  result = result
    .replace(/\b(string)\b/gi, "string")
    .replace(/\b(number)\b/gi, "number")
    .replace(/\b(boolean)\b/gi, "boolean")
    .replace(/\b(null)\b/gi, "null")
    .replace(/\b(undefined)\b/gi, "undefined")
    .replace(/\b(true)\b/gi, "true")
    .replace(/\b(false)\b/gi, "false");

  // Clean up extra spaces
  result = result.replace(/\s{2,}/g, " ").trim();

  return result;
}

/**
 * Command mode: format speech as a clear coding instruction/prompt.
 */
function formatAsCommand(text: string): string {
  let result = text;

  // Remove filler words
  const fillers = [
    /\b(um+|uh+|ah+|eh+|er+|like|you know|basically|actually|so yeah|i mean)\b/gi,
  ];
  for (const filler of fillers) {
    result = result.replace(filler, "");
  }

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
