import { expect, test } from '@playwright/test';

const image = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH1cAAAAASUVORK5CYII=',
  'base64',
);

test('school archive: taxonomy, local import, accent-insensitive search, language, offline restart and portable restore', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Un loc pentru fiecare document.' })).toBeVisible();
  await page.getByRole('tab', { name: 'Categorii', exact: true }).click();
  await page.getByRole('button', { name: 'Categorie nouă', exact: true }).click();
  await page.getByRole('textbox', { name: 'Denumire', exact: true }).fill('Mape de probă');
  await page.getByRole('button', { name: 'Salvează', exact: true }).click();
  await expect(page.getByText('Mape de probă', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Etichete', exact: true }).click();
  await page.getByRole('button', { name: 'Etichetă nouă', exact: true }).first().click();
  await page.getByRole('textbox', { name: 'Denumire', exact: true }).fill('Verificat fictiv');
  await page.getByRole('button', { name: 'Salvează', exact: true }).click();

  await page.getByRole('button', { name: '+ Document nou', exact: true }).first().click();
  await page.getByRole('textbox', { name: 'Titlu · obligatoriu', exact: true }).fill('Fișă matricolă de probă');
  await page.getByRole('textbox', { name: 'Nume elev', exact: true }).fill('Ștefan Fictiv');
  await page.getByRole('textbox', { name: 'An școlar', exact: true }).fill('2026-2027');
  await page.getByRole('textbox', { name: 'Text extras / transcriere', exact: true }).fill('Înscriere demonstrativă fără date reale');
  await page.getByRole('button', { name: 'Mape de probă', exact: true }).click();
  await page.getByRole('button', { name: 'Verificat fictiv', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Adaugă fișiere', exact: true }).click();
  await (await chooser).setFiles({ name: 'pagina-proba.png', mimeType: 'image/png', buffer: image });
  await expect(page.getByText('pagina-proba.png', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Extrage textul: pagina-proba.png', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Salvează documentul', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Detaliile documentului', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Închide', exact: true }).click();
  await page.getByRole('textbox', { name: 'Caută în arhivă', exact: true }).fill('stefan inscriere');
  await expect(page.getByText('Fișă matricolă de probă', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Setări', exact: true }).click();
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'A place for every document.', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Archive', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search archive', exact: true }).fill('stefan');
  await page.getByText('Fișă matricolă de probă', { exact: true }).click();
  const attachmentDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Open: pagina-proba.png', exact: true }).click();
  expect((await attachmentDownload).suggestedFilename()).toBe('pagina-proba.png');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
  const backupDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export archive', exact: true }).click();
  const backupPath = await (await backupDownload).path();
  expect(backupPath).toBeTruthy();

  await page.getByRole('button', { name: 'Restore a backup', exact: true }).click();
  const backupChooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose backup and replace', exact: true }).click();
  await (await backupChooser).setFiles(backupPath!);
  await expect(page.getByText('Backup restored.', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Archive', exact: true }).click();
  await expect(page.getByText('Fișă matricolă de probă', { exact: true })).toBeVisible();
  await context.setOffline(false);
});

test('small Android-sized viewport supports manual entry and navigation without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Document nou', exact: true }).first().click();
  await page.getByRole('textbox', { name: 'Titlu · obligatoriu', exact: true }).fill('Catalog fictiv mobil');
  await page.getByRole('button', { name: 'Salvează documentul', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Detaliile documentului', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Închide', exact: true }).click();
  await page.getByRole('tab', { name: 'Setări', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Setări', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('corrupt local metadata is reported, not overwritten with a new archive', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Un loc pentru fiecare document.' })).toBeVisible();
  await page.evaluate(async () => {
    const request = indexedDB.open('docarchive', 1);
    await new Promise<void>((resolve, reject) => {
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('snapshots', 'readwrite');
        transaction.objectStore('snapshots').put('corrupt fixture', 'archive');
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onabort = () => reject(transaction.error);
      };
      request.onerror = () => reject(request.error);
    });
  });
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Archive storage failed');
  expect(await page.evaluate(async () => {
    const request = indexedDB.open('docarchive', 1);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('snapshots', 'readonly');
        const result = transaction.objectStore('snapshots').get('archive');
        transaction.oncomplete = () => { db.close(); resolve(result.result); };
        transaction.onabort = () => reject(transaction.error);
      };
      request.onerror = () => reject(request.error);
    });
  })).toBe('corrupt fixture');
});
