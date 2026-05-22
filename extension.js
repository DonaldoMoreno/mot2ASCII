'use strict';

const fs = require('fs');
const path = require('path');

let vscodeModule;

function getVSCode() {
  if (!vscodeModule) {
    vscodeModule = require('vscode');
  }

  return vscodeModule;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseAddress(value) {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Address must be a non-empty string or integer.');
  }

  const parsed = Number.parseInt(value.trim(), 0);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid address: ${value}`);
  }

  return parsed;
}

function formatAddress(value) {
  return `0x${value.toString(16).toUpperCase().padStart(8, '0')}`;
}

function parseSRecordLine(line) {
  const trimmed = line.trim();

  if (!/^S[123]/.test(trimmed)) {
    return null;
  }

  const type = trimmed[1];
  const addressBytes = { '1': 2, '2': 3, '3': 4 }[type];

  if (!addressBytes || trimmed.length < 4) {
    return null;
  }

  const byteCount = Number.parseInt(trimmed.slice(2, 4), 16);

  if (Number.isNaN(byteCount)) {
    throw new Error(`Invalid S-Record byte count: ${line}`);
  }

  const payload = trimmed.slice(4);
  const expectedHexLength = byteCount * 2;

  if (payload.length < expectedHexLength) {
    throw new Error(`Incomplete S-Record line: ${line}`);
  }

  const recordHex = payload.slice(0, expectedHexLength);
  const addressHexLength = addressBytes * 2;
  const address = Number.parseInt(recordHex.slice(0, addressHexLength), 16);
  const dataHex = recordHex.slice(addressHexLength, -2);

  if (Number.isNaN(address) || dataHex.length < 0 || dataHex.length % 2 !== 0) {
    throw new Error(`Invalid S-Record payload: ${line}`);
  }

  const bytes = [];

  for (let index = 0; index < dataHex.length; index += 2) {
    bytes.push(Number.parseInt(dataHex.slice(index, index + 2), 16));
  }

  return {
    type: `S${type}`,
    address,
    data: Buffer.from(bytes),
    endAddress: address + bytes.length,
    originalLine: trimmed
  };
}

function parseMotContent(content) {
  return content
    .split(/\r?\n/)
    .map(parseSRecordLine)
    .filter(Boolean);
}

function parseConfigFile(configPath) {
  let parsed;

  try {
    parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid config JSON: ${error.message}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid config JSON: root value must be an object.');
  }

  if (typeof parsed.file !== 'string' || parsed.file.trim() === '') {
    throw new Error('Invalid config JSON: "file" must be a non-empty string.');
  }

  if (!Array.isArray(parsed.views)) {
    throw new Error('Invalid config JSON: "views" must be an array.');
  }

  const views = parsed.views.map((view, index) => {
    if (!view || typeof view !== 'object' || Array.isArray(view)) {
      throw new Error(`Invalid config JSON: view at index ${index} must be an object.`);
    }

    if (typeof view.label !== 'string' || view.label.trim() === '') {
      throw new Error(`Invalid config JSON: view at index ${index} is missing a valid "label".`);
    }

    if (!Number.isInteger(view.length) || view.length <= 0) {
      throw new Error(`Invalid config JSON: view "${view.label}" must define a positive integer "length".`);
    }

    if (typeof view.format !== 'string') {
      throw new Error(`Invalid config JSON: view "${view.label}" must define a "format".`);
    }

    const format = view.format.toLowerCase();

    if (!['ascii', 'hex', 'dec', 'bin'].includes(format)) {
      throw new Error(`Invalid config JSON: unsupported format "${view.format}" for view "${view.label}".`);
    }

    return {
      label: view.label,
      address: parseAddress(view.address),
      length: view.length,
      format
    };
  });

  return {
    file: parsed.file,
    views
  };
}

function loadMotFile(configPath, config) {
  const motPath = path.isAbsolute(config.file)
    ? config.file
    : path.resolve(path.dirname(configPath), config.file);

  if (!fs.existsSync(motPath)) {
    throw new Error(`MOT file does not exist: ${motPath}`);
  }

  const content = fs.readFileSync(motPath, 'utf8');

  return {
    motPath,
    records: parseMotContent(content)
  };
}

function findAddressInMot(records, address) {
  return records.find((record) => address >= record.address && address < record.endAddress) || null;
}

function extractBytes(record, address, length) {
  const offset = address - record.address;
  const endOffset = offset + length;

  if (offset < 0 || offset >= record.data.length) {
    throw new Error('Address is outside the S-Record data range.');
  }

  if (endOffset > record.data.length) {
    throw new Error('Requested length exceeds the S-Record data range.');
  }

  return record.data.subarray(offset, endOffset);
}

function convertBytes(bytes, format) {
  switch (format) {
    case 'ascii':
      return Array.from(bytes, (value) => (value >= 32 && value <= 126 ? String.fromCharCode(value) : '.')).join('');
    case 'hex':
      return Array.from(bytes, (value) => value.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    case 'dec':
      return Array.from(bytes, (value) => value.toString(10)).join(' ');
    case 'bin':
      return Array.from(bytes, (value) => value.toString(2).padStart(8, '0')).join(' ');
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

function renderWebview(results, context) {
  const rows = results.map((result) => {
    return `<tr>
      <td>${escapeHtml(result.label)}</td>
      <td>${escapeHtml(result.address)}</td>
      <td>${escapeHtml(result.rawBytes)}</td>
      <td>${escapeHtml(result.translation)}</td>
      <td><code>${escapeHtml(result.recordLine)}</code></td>
    </tr>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MOT Config Results</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 16px;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin-top: 16px;
    }
    th, td {
      border: 1px solid var(--vscode-panel-border);
      padding: 8px;
      text-align: left;
      vertical-align: top;
    }
    th {
      background: var(--vscode-editor-inactiveSelectionBackground);
    }
    code {
      white-space: pre-wrap;
      word-break: break-all;
    }
  </style>
</head>
<body>
  <h1>MOT Config Results</h1>
  <p><strong>Config:</strong> ${escapeHtml(context.configPath)}</p>
  <p><strong>MOT file:</strong> ${escapeHtml(context.motPath)}</p>
  <table>
    <thead>
      <tr>
        <th>Label</th>
        <th>Dirección</th>
        <th>Bytes crudos</th>
        <th>Traducción</th>
        <th>Línea S-Record original</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>`;
}

async function handleLoadConfig() {
  const vscode = getVSCode();
  const selection = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: {
      JSON: ['json']
    },
    openLabel: 'Load MOT Config'
  });

  if (!selection || selection.length === 0) {
    return;
  }

  const configPath = selection[0].fsPath;

  try {
    const config = parseConfigFile(configPath);
    const motData = loadMotFile(configPath, config);
    const results = config.views.map((view) => {
      try {
        const record = findAddressInMot(motData.records, view.address);

        if (!record) {
          throw new Error('Address not found');
        }

        const bytes = extractBytes(record, view.address, view.length);

        return {
          label: view.label,
          address: formatAddress(view.address),
          rawBytes: convertBytes(bytes, 'hex'),
          translation: convertBytes(bytes, view.format),
          recordLine: record.originalLine
        };
      } catch (error) {
        return {
          label: view.label,
          address: formatAddress(view.address),
          rawBytes: '—',
          translation: `Error: ${error.message}`,
          recordLine: '—'
        };
      }
    });

    const panel = vscode.window.createWebviewPanel(
      'motConfigResults',
      'MOT Config Results',
      vscode.ViewColumn.One,
      { enableScripts: false }
    );

    panel.webview.html = renderWebview(results, {
      configPath,
      motPath: motData.motPath
    });
  } catch (error) {
    vscode.window.showErrorMessage(error.message);
  }
}

function activate(context) {
  const vscode = getVSCode();

  context.subscriptions.push(
    vscode.commands.registerCommand('mot.loadConfig', handleLoadConfig)
  );
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
  parseConfigFile,
  loadMotFile,
  findAddressInMot,
  extractBytes,
  convertBytes,
  renderWebview
};
