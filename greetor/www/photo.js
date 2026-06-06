;(function () {
  "use strict";

  /* ------------------------------------------------------------------ */
  /* GPS cache                                                            */
  /* ------------------------------------------------------------------ */
  var _gpsCache = null;       // { lat, lng, ts }
  var GPS_TTL   = 5 * 60 * 1000; // 5 min

  function getCachedGps() {
    return new Promise(function (resolve) {
      if (_gpsCache && (Date.now() - _gpsCache.ts) < GPS_TTL) {
        resolve({ lat: _gpsCache.lat, lng: _gpsCache.lng });
        return;
      }
      if (!navigator.geolocation) { resolve(null); return; }
      var done = false;
      var timer = setTimeout(function () {
        if (!done) { done = true; resolve(null); }
      }, 4000);
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          _gpsCache = { lat: pos.coords.latitude, lng: pos.coords.longitude, ts: Date.now() };
          resolve({ lat: _gpsCache.lat, lng: _gpsCache.lng });
        },
        function () {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(null);
        },
        { timeout: 4000, enableHighAccuracy: false }
      );
    });
  }

  /* ------------------------------------------------------------------ */
  /* Helpers                                                              */
  /* ------------------------------------------------------------------ */
  function isNative() {
    return !!(window.Capacitor &&
              window.Capacitor.isNativePlatform &&
              window.Capacitor.isNativePlatform());
  }

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function nowStrings() {
    var d  = new Date();
    var ds = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    var ts = pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
    return { date: ds, time: ts };
  }

  /* Capture via hidden <input type=file> for web / simulator */
  function captureViaInput() {
    return new Promise(function (resolve) {
      var input = document.createElement('input');
      input.type    = 'file';
      input.accept  = 'image/*';
      input.capture = 'environment';
      input.style.display = 'none';
      document.body.appendChild(input);

      var resolved = false;

      input.addEventListener('change', function () {
        var file = input.files && input.files[0];
        document.body.removeChild(input);
        if (!file) { resolved = true; resolve(null); return; }
        var reader = new FileReader();
        reader.onload = function (e) {
          if (!resolved) { resolved = true; resolve(e.target.result); }
        };
        reader.onerror = function () {
          if (!resolved) { resolved = true; resolve(null); }
        };
        reader.readAsDataURL(file);
      });

      /* If user dismisses picker without choosing, focus returns */
      window.addEventListener('focus', function onFocus() {
        window.removeEventListener('focus', onFocus);
        setTimeout(function () {
          if (!resolved) {
            resolved = true;
            try { document.body.removeChild(input); } catch (_) {}
            resolve(null);
          }
        }, 400);
      }, { once: true });

      input.click();
    });
  }

  /* Scale an Image onto a canvas so long edge ≤ 1024 */
  function scaleImage(img) {
    var MAX = 1024;
    var w = img.naturalWidth  || img.width;
    var h = img.naturalHeight || img.height;
    if (w === 0 || h === 0) return null;
    var scale = Math.min(1, MAX / Math.max(w, h));
    var canvas = document.createElement('canvas');
    canvas.width  = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  /* Burn watermark; returns true on success */
  function burnWatermark(canvas, meta, gps) {
    var ctx = canvas.getContext('2d');
    if (!ctx) return false;

    var cw = canvas.width;
    var ch = canvas.height;
    var bandH = Math.round(ch * 0.16);
    var y0    = ch - bandH;

    /* Semi-opaque navy band */
    ctx.fillStyle = 'rgba(11,31,58,0.82)';
    ctx.fillRect(0, y0, cw, bandH);

    /* Font sizing — fit three lines in bandH */
    var fontSize = Math.max(10, Math.floor(bandH / 3.8));
    ctx.font      = fontSize + 'px sans-serif';
    ctx.fillStyle = '#e0b85d';
    ctx.textBaseline = 'top';

    var dt   = nowStrings();
    var pad  = Math.round(fontSize * 0.5);
    var lineH = Math.round(fontSize * 1.25);

    var line1 = dt.date + ' ' + dt.time;
    var line2 = (meta.store || '') + ' · ' + (meta.greetor || '');
    var line3 = gps ? (gps.lat.toFixed(5) + ', ' + gps.lng.toFixed(5)) : '';

    ctx.fillText(line1, pad, y0 + pad);
    ctx.fillText(line2, pad, y0 + pad + lineH);
    if (line3) {
      ctx.fillText(line3, pad, y0 + pad + lineH * 2);
    }

    /* Small tag at right */
    var tagFont = Math.max(8, Math.floor(fontSize * 0.75));
    ctx.font      = 'bold ' + tagFont + 'px sans-serif';
    ctx.fillStyle = 'rgba(224,184,93,0.65)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Saagar Greetor', cw - pad, ch - Math.round(pad * 0.6));

    return true;
  }

  /* dataUrl → base64 (strip prefix) */
  function stripPrefix(dataUrl) {
    var idx = dataUrl.indexOf(',');
    return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
  }

  /* Load a dataUrl into a canvas (scaled + watermarked); returns Promise<{canvas,jpegDataUrl}|null> */
  function processDataUrl(dataUrl, meta) {
    return getCachedGps().then(function (gps) {
      return new Promise(function (resolve) {
        var img = new Image();
        img.onload = function () {
          try {
            var canvas = scaleImage(img);
            if (!canvas) { resolve(null); return; }
            burnWatermark(canvas, meta, gps);
            var jpegDataUrl = canvas.toDataURL('image/jpeg', 0.7);
            resolve({ canvas: canvas, jpegDataUrl: jpegDataUrl });
          } catch (e) {
            console.warn('[Photo] canvas processing error', e);
            resolve(null);
          }
        };
        img.onerror = function () {
          console.warn('[Photo] Image load error');
          resolve(null);
        };
        img.src = dataUrl;
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Public API                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * Photo.capture(meta) -> Promise<{ path, uri, src } | null>
   */
  function capture(meta) {
    meta = meta || {};

    /* Step 1: get dataUrl */
    var dataUrlPromise;

    if (isNative() && window.Capacitor.Plugins && window.Capacitor.Plugins.Camera) {
      var Camera = window.Capacitor.Plugins.Camera;
      dataUrlPromise = Promise.resolve().then(function () {
        return Camera.getPhoto({
          quality:       60,
          allowEditing:  false,
          resultType:    'dataUrl',
          source:        'CAMERA'
        });
      }).then(function (result) {
        /* Capacitor wraps the value in result.dataUrl */
        var raw = (result && (result.dataUrl || result.base64String)) || null;
        if (!raw) return null;
        /* Ensure it has the data URI scheme */
        return raw.indexOf('data:') === 0 ? raw : ('data:image/jpeg;base64,' + raw);
      }).catch(function (err) {
        /* User cancelled or permission denied */
        console.warn('[Photo] Camera cancelled/error', err);
        return null;
      });
    } else {
      dataUrlPromise = captureViaInput();
    }

    return dataUrlPromise.then(function (dataUrl) {
      if (!dataUrl) return null;

      /* Steps 2-4: scale, watermark, encode */
      return processDataUrl(dataUrl, meta);
    }).then(function (processed) {
      if (!processed) return null;

      var jpegDataUrl = processed.jpegDataUrl;
      var base64      = stripPrefix(jpegDataUrl);
      var fileName    = 'photos/np_' + Date.now() + '.jpg';

      /* Step 5: store */
      if (isNative() && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem) {
        var Filesystem = window.Capacitor.Plugins.Filesystem;
        return Promise.resolve().then(function () {
          return Filesystem.writeFile({
            path:      fileName,
            data:      base64,
            directory: 'DATA',
            recursive: true
          });
        }).then(function () {
          return Filesystem.getUri({ path: fileName, directory: 'DATA' });
        }).then(function (uriResult) {
          var uri = uriResult && uriResult.uri;
          var src = uri ? window.Capacitor.convertFileSrc(uri) : jpegDataUrl;
          return { path: fileName, uri: uri || '', src: src };
        }).catch(function (e) {
          console.warn('[Photo] Filesystem error, falling back to dataUrl', e);
          // Native write failed (commonly: device storage full). Warn the user —
          // the photo is kept inline as a fallback but that bloats the record, so
          // they should free up space. Silent failure previously hid this.
          try {
            if (typeof window.toast === 'function') {
              window.toast('Low storage — photo saved in a reduced way. Free up space.');
            }
          } catch (_) {}
          return { path: '', uri: jpegDataUrl, src: jpegDataUrl };
        });
      }

      /* Web: return dataUrl directly */
      return { path: '', uri: jpegDataUrl, src: jpegDataUrl };

    }).catch(function (e) {
      console.warn('[Photo] capture error', e);
      return null;
    });
  }

  /**
   * Photo.src(ref) -> string
   */
  function src(ref) {
    var uri = (ref && typeof ref === 'object') ? (ref.src || ref.uri || '') : (ref || '');
    if (!uri) return '';
    if (/^data:/.test(uri) || /^https?:/.test(uri)) return uri;
    if (isNative() && window.Capacitor && window.Capacitor.convertFileSrc) {
      return window.Capacitor.convertFileSrc(uri);
    }
    return uri;
  }

  /**
   * Photo.remove(ref) -> Promise<void>
   */
  function remove(ref) {
    if (!ref || !isNative()) return Promise.resolve();
    var path = (typeof ref === 'object') ? ref.path : '';
    if (!path) return Promise.resolve();
    if (!window.Capacitor.Plugins || !window.Capacitor.Plugins.Filesystem) return Promise.resolve();
    var Filesystem = window.Capacitor.Plugins.Filesystem;
    return Promise.resolve().then(function () {
      return Filesystem.deleteFile({ path: path, directory: 'DATA' });
    }).catch(function (e) {
      console.warn('[Photo] remove error', e);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Export                                                               */
  /* ------------------------------------------------------------------ */
  window.Photo = { capture: capture, src: src, remove: remove };

}());
