'use strict';
const previewDialog = $('previewDialog');
const printButton = $('sendToPrinter');
const pdfJsRoot = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.6.205/';
let previewRun = 0;
let pageUrls = [];
function clearPrintPreview() {
  ++previewRun;
  $('printPages').replaceChildren();
  $('previewPages').replaceChildren();
  $('printPaperRules').textContent = '';
  pageUrls.forEach(url => URL.revokeObjectURL(url));
  pageUrls = [];
  printButton.disabled = true;
}
previewDialog.addEventListener('close', clearPrintPreview);
$('closePreview').onclick = () => previewDialog.close();
$('backToPrint').onclick = () => previewDialog.close();
printButton.onclick = () => window.print();
async function showPrintPreview(bytes, title, layout) {
  clearPrintPreview();
  const run = previewRun;
  const info = $('previewInfo');
  info.textContent = 'プレビューを作成しています…';
  previewDialog.showModal();
  let loading;
  try {
    const renderer = await import(pdfJsRoot + 'legacy/build/pdf.min.mjs');
    renderer.GlobalWorkerOptions.workerSrc = pdfJsRoot + 'legacy/build/pdf.worker.min.mjs';
    loading = renderer.getDocument({
      data: bytes.slice(),
      cMapUrl: pdfJsRoot + 'cmaps/',
      cMapPacked: true,
      standardFontDataUrl: pdfJsRoot + 'standard_fonts/',
      wasmUrl: pdfJsRoot + 'wasm/'
    });
    const pdf = await loading.promise;
    const paperRules = new Map();
    for (let number = 1; number <= pdf.numPages; number++) {
      if (run !== previewRun) return;
      info.textContent = 'プレビューを作成中（' + number + ' / ' + pdf.numPages + '）';
      const page = await pdf.getPage(number);
      const size = page.getViewport({scale:1});
      const scale = Math.min(200/72, 3200/Math.max(size.width,size.height));
      const viewport = page.getViewport({scale});
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({canvas, viewport, background:'#fff'}).promise;
      const imageBlob = await new Promise(resolve => canvas.toBlob(resolve,'image/png'));
      canvas.width = canvas.height = 0;
      page.cleanup();
      if (run !== previewRun) return;
      if (!imageBlob) throw new Error('ページ画像を作成できませんでした。');
      const image = make('img');
      image.alt = number + 'ページ目';
      image.src = URL.createObjectURL(imageBlob);
      pageUrls.push(image.src);
      await image.decode();
      if (run !== previewRun) return;
      $('previewPages').append(image);
      const sheet = make('div',null,'print-sheet');
      const key = size.width.toFixed(2) + 'pt ' + size.height.toFixed(2) + 'pt';
      if (!paperRules.has(key)) paperRules.set(key,'teststock-sheet-' + paperRules.size);
      sheet.style.page = paperRules.get(key);
      sheet.style.width = size.width + 'pt';
      sheet.style.height = size.height + 'pt';
      sheet.append(image.cloneNode());
      $('printPages').append(sheet);
    }
    $('printPaperRules').textContent = [...paperRules].map(([size,name])=>'@page '+name+'{size:'+size+';margin:0}').join('\n');
    info.textContent = title + ' ／ ' + pdf.numPages + 'ページ' +
      (layout === 'normal' ? '' : ' ／ 冊子は両面・短辺とじ');
    printButton.disabled = false;
  } catch {
    if (run === previewRun) {
      clearPrintPreview();
      const url = URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
      pageUrls.push(url);
      const frame = make('iframe',null,'pdf-preview-fallback');
      frame.title = '印刷用PDF';
      frame.src = url;
      $('previewPages').append(frame);
      info.textContent = 'PDFビューアで表示しています。ビューア内の印刷アイコンを使ってください。';
      const link = make('a','PDFを別タブで開く');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      info.append(' ',link);
    }
  } finally {
    await loading?.destroy().catch(()=>{});
  }
}
