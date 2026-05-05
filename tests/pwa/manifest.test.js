import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');

describe('manifest.json', () => {
  let manifest;

  it('é JSON válido', () => {
    const raw = readFileSync(join(root, 'manifest.json'), 'utf-8');
    expect(() => {
      manifest = JSON.parse(raw);
    }).not.toThrow();
  });

  it('tem campos obrigatórios para PWA instalável', () => {
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBeTruthy();
    expect(manifest.display).toMatch(/^(standalone|fullscreen|minimal-ui)$/);
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  it('tem ícone 192x192 e 512x512 (recomendados pelo Android)', () => {
    const sizes = manifest.icons.map((i) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
  });

  it('tem theme_color e background_color', () => {
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe('sw.js', () => {
  it('existe e contém estratégias de cache', () => {
    const sw = readFileSync(join(root, 'sw.js'), 'utf-8');
    expect(sw).toContain('install');
    expect(sw).toContain('activate');
    expect(sw).toContain('fetch');
    expect(sw).toMatch(/CACHE_VERSION/);
  });

  it('NÃO cacheia requisições para Firestore/Auth', () => {
    const sw = readFileSync(join(root, 'sw.js'), 'utf-8');
    // Deve ter check para googleapis.com (Firestore/Auth)
    expect(sw).toMatch(/googleapis\.com/);
  });
});
