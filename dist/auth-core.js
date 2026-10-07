/* Authentication URL handling is kept independent of the page and SDK. */
(function (root) {
  const callbackKeys = ['access_token','refresh_token','expires_in','expires_at','token_type','type','code','token_hash','error','error_code','error_description'];
  function readCallback(href) {
    const url = new URL(href), hash = new URLSearchParams(url.hash.slice(1));
    const get = key => url.searchParams.get(key) || hash.get(key);
    return {
      recovery: url.pathname.startsWith('/nouveau-mot-de-passe') || get('type') === 'recovery' || get('recovery') === '1',
      forgot: get('auth') === 'forgot',
      error: get('error_code') || get('error'),
      type: get('type'), tokenHash: get('token_hash'), code: get('code'),
      accessToken: get('access_token'), refreshToken: get('refresh_token'),
      hasCallback: callbackKeys.some(key => get(key)),
    };
  }
  function cleanCallback(href, recovery = false) {
    const url = new URL(href);
    callbackKeys.forEach(key => url.searchParams.delete(key));
    url.searchParams.delete('recovery');
    if (recovery) url.searchParams.set('recovery','1');
    if (/access_token|refresh_token|error=|type=|token_hash|code=/.test(url.hash)) url.hash = '';
    return url.pathname + url.search + url.hash;
  }
  async function resolveCallback(auth, callback) {
    if (callback.error) throw Object.assign(new Error('Link expired'),{code:'otp_expired'});
    let result;
    if (callback.tokenHash) {
      if (!['recovery','signup','email','invite','email_change'].includes(callback.type)) throw Object.assign(new Error('Invalid link'),{code:'otp_expired'});
      result = await auth.verifyOtp({token_hash:callback.tokenHash,type:callback.type});
    } else if (callback.code) result = await auth.exchangeCodeForSession(callback.code);
    else if (callback.accessToken || callback.refreshToken) {
      if (!callback.accessToken || !callback.refreshToken) throw Object.assign(new Error('Incomplete link'),{code:'otp_expired'});
      result = await auth.setSession({access_token:callback.accessToken,refresh_token:callback.refreshToken});
    } else result = await auth.getSession();
    if (result.error) throw result.error;
    return result.data?.session || null;
  }
  const api = {readCallback,cleanCallback,resolveCallback};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PrepagoAuthCore = api;
})(globalThis);
