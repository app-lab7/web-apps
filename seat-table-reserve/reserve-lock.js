(() => {
  const form = document.getElementById('reserve-lock-form');
  const pin = document.getElementById('lock-pin');
  const confirmPin = document.getElementById('lock-confirm');
  const confirmWrap = document.getElementById('lock-confirm-wrap');
  const help = document.getElementById('lock-help');
  const error = document.getElementById('lock-error');
  const submit = document.getElementById('lock-submit');
  const storage = window.__seatStorageOverride;
  const key = 'local-screen-lock-v1';
  let record;

  async function digest(salt, value) {
    const bytes = new TextEncoder().encode(salt + ':' + value);
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function openSeatTable() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'app.js?v=reserve-lock-1';
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    });
  }

  try {
    if (!crypto.subtle) throw new Error('Secure context required');
    const saved = storage.getItem(key);
    record = saved ? JSON.parse(saved) : null;
  } catch {
    help.textContent = '番号の設定を読み込めません。このブラウザーでサイトのデータ保存を許可してから再読み込みしてください。';
    return;
  }

  help.textContent = record ? 'この端末で設定した4桁を入力してください。' : 'この端末で使う、教室の4桁の番号を設定してください。';
  confirmWrap.hidden = !!record;
  confirmPin.required = !record;
  pin.disabled = submit.disabled = false;
  if (!record) submit.textContent = '設定して開く';
  pin.focus();

  form.addEventListener('submit', async event => {
    event.preventDefault();
    error.textContent = '';
    submit.disabled = true;
    try {
      const entered = pin.value;
      if (!/^[0-9]{4}$/.test(entered)) {
        error.textContent = '半角数字4桁で入力してください。';
        return;
      }
      if (record) {
        if (await digest(record.salt, entered) !== record.hash) {
          error.textContent = '番号が違います。';
          pin.select();
          return;
        }
      } else {
        if (confirmPin.value !== entered) {
          error.textContent = '確認用の番号が一致しません。';
          confirmPin.focus();
          return;
        }
        const salt = crypto.randomUUID();
        const setup = { salt, hash: await digest(salt, entered) };
        storage.setItem(key, JSON.stringify(setup));
        record = setup;
        confirmWrap.hidden = true;
        confirmPin.required = false;
        help.textContent = 'この端末で設定した4桁を入力してください。';
        submit.textContent = '開く';
      }
      await openSeatTable();
      form.reset();
      document.body.removeAttribute('data-locked');
      document.getElementById('tabs').querySelector('button')?.focus();
      window.dispatchEvent(new Event('resize'));
    } catch {
      error.textContent = '座席表を開けませんでした。再読み込みしてから試してください。';
    } finally {
      submit.disabled = false;
    }
  });
})();
