# mot2ASCII

A VS Code extension for decoding data from Motorola S-Record (`.mot`) files. It reads a JSON config file that specifies memory addresses and display formats, then shows the decoded results in a webview panel inside VS Code.

## Requirements

- Visual Studio Code `^1.85.0`

## Installation

1. Clone or download this repository.
2. Open the folder in VS Code.
3. Press `F5` to launch the extension in a new Extension Development Host window.

## Usage

### 1. Create a config file

Create a `.json` config file that describes which `.mot` file to read and which memory regions to display. Each entry in `views` targets a specific address, length (in bytes), and output format.

```json
{
  "file": "path/to/your/firmware.mot",
  "views": [
    {
      "label": "Device Name",
      "address": "0x00010000",
      "length": 16,
      "format": "ascii"
    },
    {
      "label": "Version Bytes",
      "address": "0x00010010",
      "length": 4,
      "format": "hex"
    }
  ]
}
```

- **`file`** — Path to the `.mot` file. Can be absolute or relative to the config file.
- **`views`** — Array of regions to decode.
  - **`label`** — A human-readable name shown in the results table.
  - **`address`** — Memory address to read from (integer or hex string, e.g. `"0x1000"` or `4096`).
  - **`length`** — Number of bytes to read.
  - **`format`** — How to display the bytes. Supported values:
    - `ascii` — Printable ASCII characters (non-printable bytes shown as `.`)
    - `hex` — Uppercase hex pairs separated by spaces (e.g. `48 65 6C 6C`)
    - `dec` — Decimal values separated by spaces (e.g. `72 101 108 108`)
    - `bin` — 8-bit binary strings separated by spaces (e.g. `01001000 01100101`)

### 2. Run the command

1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
2. Type **`MOT: Load MOT Config File`** and press Enter.
3. A file picker will open — select your `.json` config file.
4. A results panel will appear showing a table with label, address, raw hex bytes, decoded translation, and the matching S-Record line for each configured view.

## Supported S-Record Types

The extension supports `S1`, `S2`, and `S3` record types (2-byte, 3-byte, and 4-byte addresses respectively).