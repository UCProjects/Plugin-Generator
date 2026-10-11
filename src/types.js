import fs from 'node:fs/promises';

export const TYPES_URL = 'https://github.com/UCProjects/UnderScript/releases/latest/download/underscript.d.ts';
export const TYPES_FILE = 'underscript.d.ts';
export const TYPES_PAGE = 'https://github.com/UCProjects/UnderScript/releases/latest';

export async function downloadTypes(into, { url = TYPES_URL, request = fetch } = {}) {
  const response = await request(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim());
  await fs.writeFile(into, await response.text());
}
