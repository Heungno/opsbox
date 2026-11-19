function escapeHtml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function highlightJsonBlock(element, value) {
  const source = String(value ?? '');
  const token = /"(?:\\.|[^"\\])*"|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b|\b(?:true|false|null)\b|[{}\[\]:,]/g;
  let html = '';
  let position = 0;
  for (const match of source.matchAll(token)) {
    const text = match[0];
    const offset = match.index ?? position;
    html += escapeHtml(source.slice(position, offset));
    const next = source.slice(offset + text.length).match(/^\s*:/);
    const type = text[0] === '"' ? (next ? 'json-key' : 'json-string')
      : /^(?:true|false)$/.test(text) ? 'json-boolean'
        : text === 'null' ? 'json-null'
          : /^-?\d/.test(text) ? 'json-number' : 'json-punctuation';
    html += `<span class="syntax-${type}">${escapeHtml(text)}</span>`;
    position = offset + text.length;
  }
  html += escapeHtml(source.slice(position));
  element.innerHTML = html;
}

export function highlightConsoleOutput(element, value) {
  const source = String(value ?? '').replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
  const severity = /\b(?:FATAL|CRITICAL|ERROR|FAILED|FAIL)\b|\b(?:WARN(?:ING)?)\b|\b(?:INFO|DEBUG|NOTICE)\b|\b(?:HEALTHY|RUNNING|CONNECTED|ONLINE|SUCCESS)\b|\b(?:STOPPED|OFFLINE|NOTCOLLECTED)\b/gi;
  const html = source.split(/\r?\n/).map((line) => {
    const escaped = escapeHtml(line);
    if (/^\s*(?:[>$#]\s|(?:wsadmin|jeusadmin)(?:\.cmd)?\b)/i.test(line)) {
      return `<span class="console-command">${escaped}</span>`;
    }
    let result = '';
    let position = 0;
    for (const match of line.matchAll(severity)) {
      const word = match[0];
      const offset = match.index ?? position;
      result += escapeHtml(line.slice(position, offset));
      const upper = word.toUpperCase();
      const type = /^(?:FATAL|CRITICAL|ERROR|FAILED|FAIL|STOPPED|OFFLINE)$/.test(upper) ? 'console-danger'
        : /^WARN/.test(upper) ? 'console-warning'
          : /^(?:HEALTHY|RUNNING|CONNECTED|ONLINE|SUCCESS)$/.test(upper) ? 'console-success' : 'console-info';
      result += `<span class="${type}">${escapeHtml(word)}</span>`;
      position = offset + word.length;
    }
    return result + escapeHtml(line.slice(position));
  }).join('\n');
  element.innerHTML = html;
}
