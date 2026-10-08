/* XO accounts: login, cloud save, profile bar. One file, shared by every page. */
(function () {
  var CFG = { apiKey:"AIzaSyCtDlSEnVV26SryyLZmzBlWxu0uA4IPiUE", authDomain:"omarfarid-1af0c.firebaseapp.com",
    databaseURL:"https://omarfarid-1af0c-default-rtdb.firebaseio.com", projectId:"omarfarid-1af0c",
    storageBucket:"omarfarid-1af0c.firebasestorage.app", messagingSenderId:"1026936277627",
    appId:"1:1026936277627:web:30e2ed7b571cf96952b0de" };
  var DIVS = [{id:10,name:"Iron",color:"#888888"},{id:9,name:"Bronze",color:"#cd7f32"},{id:8,name:"Silver",color:"#cccccc"},{id:7,name:"Gold",color:"#ffcc00"},{id:6,name:"Platinum",color:"#00ccff"},{id:5,name:"Emerald",color:"#00ff99"},{id:4,name:"Diamond",color:"#00f3ff"},{id:3,name:"Elite",color:"#bc13fe"},{id:2,name:"Master",color:"#ff8800"},{id:1,name:"Legend",color:"#ff2244"}];
  var AVATARS = ["❌","⭕","🔥","👑","⚡","🐉","🦅","🚀","💀","🎯","🌙","🧠","🦁","🐺","🥷","🎮","💎","🧊"];
  var SAVE_KEYS = ["xo_league_v2","xo_player","xo_lastrank","xo_stats"];
  var LS = window.localStorage, auth, db, user = null, ready, pushT, readyCbs = [], offline = false;
  function g(k){ try { return LS.getItem(k); } catch(e){ return null; } }
  function s(k,v){ window.__xoPulling = true; try { LS.setItem(k,v); } catch(e){} window.__xoPulling = false; }
  function d(k){ try { LS.removeItem(k); } catch(e){} }
  function esc(t){ return String(t).replace(/[<>&"]/g,""); }
  function email(u){ return u.toLowerCase() + "@xo.game"; }

  // ---- load Firebase modules (reuse whatever version the page already has) ----
  function load(src){ return new Promise(function(ok,no){ var e=document.createElement("script"); e.src=src; e.onload=ok; e.onerror=no; document.head.appendChild(e); }); }
  function boot(){
    var v = (window.firebase && firebase.SDK_VERSION) || "10.7.1", b = "https://www.gstatic.com/firebasejs/"+v+"/firebase-", p = Promise.resolve();
    if (!window.firebase) p = p.then(function(){ return load(b+"app-compat.js"); });
    p = p.then(function(){ return firebase.auth ? 0 : load(b+"auth-compat.js"); })
         .then(function(){ return firebase.database ? 0 : load(b+"database-compat.js"); });
    return p.then(function(){
      var app = firebase.apps.filter(function(a){ return a.name==="xoAuth"; })[0] || firebase.initializeApp(CFG,"xoAuth");
      auth = app.auth(); db = app.database();
      return new Promise(function(res){ var off = auth.onAuthStateChanged(function(u){ off(); user = u; res(u); }); });
    });
  }

  // ---- cloud save ----
  function snapshotLocal(){
    var o = {}; SAVE_KEYS.forEach(function(k){ var v = g(k); if (v !== null) o[k] = v; }); o.t = Date.now(); return o;
  }
  function push(){
    if (!user) return Promise.resolve();
    var o = snapshotLocal(), ups = { "save": o };
    try { var p = JSON.parse(o.xo_player||"null"); if (p && p.named && p.name) ups["profile/name"] = esc(p.name).slice(0,14); } catch(e){}
    return db.ref("users/"+user.uid).update(ups).then(function(){ d("xo_dirty"); }).catch(function(){});
  }
  function pull(){
    if (!user) return Promise.resolve();
    if (g("xo_dirty")) return push();          // unsynced local progress wins, then uploads
    return db.ref("users/"+user.uid).once("value").then(function(sn){
      var v = sn.val() || {}, pr = v.profile || {}, sv = v.save || {};
      SAVE_KEYS.forEach(function(k){ if (sv[k] != null) s(k, sv[k]); else if (k !== "xo_player") d(k); });
      s("xo_player", JSON.stringify({ id: user.uid, name: pr.name || "Player", named: true }));
      s("xo_profile", JSON.stringify(pr)); s("xo_hint", user.uid);
    });
  }
  // any write to the game's save keys is queued for upload
  var _set = Storage.prototype.setItem;
  Storage.prototype.setItem = function(k,v){
    _set.call(this,k,v);
    if (this === LS && user && SAVE_KEYS.indexOf(k) > -1 && !window.__xoPulling) { _set.call(LS,"xo_dirty","1"); clearTimeout(pushT); pushT = setTimeout(push,1500); }
  };
  window.addEventListener("pagehide", function(){ if (user && g("xo_dirty")) push(); });

  // ---- account actions ----
  function reserveTag(n){
    var t = String(10000 + Math.floor(Math.random()*90000));
    return db.ref("tags/"+t).transaction(function(c){ return c ? undefined : user.uid; }).then(function(r){
      return r.committed ? t : (n > 8 ? Promise.reject(new Error("tag")) : reserveTag((n||0)+1));
    });
  }
  function cleanUser(u){
    u = (u||"").trim();
    if (!/^[A-Za-z0-9_]{3,14}$/.test(u)) throw { msg:"Username: 3 to 14 letters, numbers or _" };
    return u;
  }
  function nice(e){
    var m = { "auth/email-already-in-use":"That username is taken. Try another.", "auth/wrong-password":"Wrong password.",
      "auth/invalid-credential":"Wrong username or password.", "auth/user-not-found":"No account with that username.",
      "auth/weak-password":"Password needs at least 6 characters.", "auth/network-request-failed":"No connection. Check your internet.",
      "auth/too-many-requests":"Too many tries. Wait a minute and retry.", "auth/operation-not-allowed":"Sign-in isn't enabled yet in Firebase (Email/Password)." };
    m["PERMISSION_DENIED"] = "Database rules blocked this. In Firebase open Realtime Database > Rules and allow the users and tags paths.";
    m["auth/configuration-not-found"] = "Authentication is not set up in Firebase yet (Build > Authentication > Get started).";
    m["auth/invalid-api-key"] = "The Firebase API key is not valid.";
    var code = e && (e.code || e.message || e);
    return (e && e.msg) || m[e && e.code] || ("Something went wrong (" + code + ")");
  }
  var API = {
    ready: function(fn){ ready.then(fn); },
    user: function(){ return user; },
    signUp: function(name, pass){
      return ready.then(function(){
        var u; try { u = cleanUser(name); } catch(e){ return Promise.reject(e); }
        if (!auth) return Promise.reject({ msg:"Could not load Firebase. Check your internet or open the game in Chrome." });
        if ((pass||"").length < 6) return Promise.reject({ code:"auth/weak-password" });
        return auth.createUserWithEmailAndPassword(email(u), pass);
      }).then(function(c){
        user = c.user;
        return reserveTag(0).then(function(tag){
          var local = null; try { local = JSON.parse(g("xo_player")||"null"); } catch(e){}
          var disp = (local && local.named && local.name) ? local.name : name.trim();
          return db.ref("users/"+user.uid+"/profile").set({ name: esc(disp).slice(0,14), tag: tag, avatar: "", created: Date.now(), u: name.trim().toLowerCase() });
        });
      }).then(function(){
        s("xo_dirty","1");                      // keep guest progress and upload it to the new account
        var p; try { p = JSON.parse(g("xo_player")||"null"); } catch(e){}
        return db.ref("users/"+user.uid+"/profile").once("value").then(function(sn){
          s("xo_player", JSON.stringify({ id:user.uid, name:sn.val().name, named:true })); s("xo_profile", JSON.stringify(sn.val()));
          d("xo_guest"); s("xo_hint", user.uid); return push();
        });
      }).catch(function(e){ throw nice(e); });
    },
    signIn: function(name, pass){
      return ready.then(function(){
        if (!auth) return Promise.reject({ msg:"Could not load Firebase. Check your internet or open the game in Chrome." });
        return auth.signInWithEmailAndPassword(email((name||"").trim()), pass); })
        .then(function(c){ user = c.user; d("xo_dirty"); d("xo_guest"); return pull(); })
        .catch(function(e){ throw nice(e); });
    },
    // call once at the end of any game: XOAuth.recordGame("ai", "win" | "draw" | "loss" | "played")
    // ("played" = a two-player game on one device, where there is no single "me" to credit)
    recordGame: function(mode, result){
      var k = { win:"w", draw:"d", loss:"l", played:"p" }[result];
      if (!k) return;
      mode = mode || "other";
      var st = {}; try { st = JSON.parse(g("xo_stats") || "{}"); } catch(e){}
      st[k] = (st[k] || 0) + 1; st.m = st.m || {};
      var m = st.m[mode] = st.m[mode] || {}; m[k] = (m[k] || 0) + 1;
      st.h = [[mode, k, Date.now()]].concat(st.h || []).slice(0, 30);
      try { LS.setItem("xo_stats", JSON.stringify(st)); } catch(e){}
      var hint = g("xo_hint");                       // signed in on this device: make sure it gets uploaded
      if (hint && hint !== "guest") { try { _set.call(LS, "xo_dirty", "1"); } catch(e){} }
    },
    guest: function(){ s("xo_guest","1"); s("xo_hint","guest"); },
    signOut: function(){
      return (user ? auth.signOut() : Promise.resolve()).then(function(){
        SAVE_KEYS.concat(["xo_profile","xo_dirty","xo_guest","xo_hint"]).forEach(d); user = null; location.href = "Login.html";
      });
    },
    setProfile: function(p){
      var cur = {}; try { cur = JSON.parse(g("xo_profile")||"{}"); } catch(e){}
      Object.keys(p).forEach(function(k){ cur[k] = p[k]; }); s("xo_profile", JSON.stringify(cur));
      if (p.name){ var pl = {}; try { pl = JSON.parse(g("xo_player")||"{}"); } catch(e){} pl.name = p.name; pl.named = true; s("xo_player", JSON.stringify(pl)); }
      return user ? db.ref("users/"+user.uid+"/profile").update(p) : Promise.resolve();
    },
    // gate: send people without an account or guest choice to the login page
    init: function(o){
      o = o || {};
      if (o.require && !g("xo_hint")) { location.replace("Login.html"); return; }
      if (o.require) document.documentElement.classList.add("xo-wait");
      ready = boot().catch(function(){ offline = true; return null; });   // no connection: keep the saved sign-in
      ready.then(function(u){
        if (o.require && !u && !offline && g("xo_hint") !== "guest" && g("xo_hint")) { d("xo_hint"); location.replace("Login.html"); return; }
        return (o.pull && u ? pull() : 0);
      }).then(function(){ document.documentElement.classList.remove("xo-wait"); if (o.bar) mountBar(); });
    }
  };
  window.XOAuth = API;
  if (!ready) ready = Promise.resolve(null);

  // ---- avatars: character maker (SVG), uploaded photo, or emoji ----
  // A character is stored as "a:" + one base-36 character per slot (older 8-digit codes still load).
  var SKIN = ["#ffdbb4","#f1c27d","#e0ac69","#c68642","#8d5524","#5b3a1e","#fde6d2","#b97a4b"],
      SKIN_SH = ["#eab98a","#d9a45f","#c68f50","#a86d2e","#6f3f16","#44290f","#efc9ae","#9c6038"],
      HAIR = ["#17171c","#4a2c17","#8b5a2b","#d9a441","#c1440e","#e6e6ea","#7c3aed","#00b8ff","#f2d27a","#ff6fb5","#2ecc71","#9aa0a6"],
      FIT = ["#7c3aed","#ff2f6d","#12c8d9","#1fd077","#f5b800","#ff8a1f","#e9e9f2","#252b4a","#3b82f6","#8b5a2b","#111111","#ff9ecb"],
      BGS = ["#35186b","#6b1038","#0d4f5c","#0d4f33","#5c4a0d","#6b3410","#343a52","#16162a","#1d3b8a","#7a1f1f","#3a2a14","#0f3d3d"],
      PAL = ["#8b5a2b","#17171c","#f4f4f8","#ff2f6d","#7c3aed","#12c8d9","#1fd077","#f5b800","#ff8a1f","#3b82f6","#d8b27a","#9aa0a6"],
      HS_N = ["Bald","Short","Crew","Quiff","Long","Curly","Bun","Spiky","Bob","Ponytail","Pigtails","Side braid","Wavy long","Mohawk","Side swept","Space buns","Long bangs","Bollywood wave","Slick back","Swept back long","Tousled quiff","Pompadour","Undercut top","Wavy fringe","Man bun","Side part"],
      EY_N = ["Happy","Cool","Wink","Wow","Laugh","Angry","Sad","Tongue","Love","Sleepy"],
      AC_N = ["None","Glasses","Shades","Cap","Headset","Round specs","Heart specs","Earrings","Face mask","Eyepatch","Bow tie","Flower","Freckles"],
      BD_N = ["Clean","Stubble","Beard","Moustache","Goatee","Big beard"],
      HT_N = ["None","Cowboy","Beanie","Bucket","Top hat","Crown","Beret","Pirate","Chef","Party","Hard hat","Wizard","Santa","Headband","Bandana","Straw hat","Grad cap"],
      HJ_N = ["None","Hijab","Long hijab","Turban"],
      MK_N = ["None","Lashes","Lashes + lips","Lips"],
      TP_N = ["T-shirt","Hoodie","Suit","Jersey","Round neck"],
      GROUPS = ["Face","Hair & hats","Outfit"],
      // [label, slot in the code, kind (c = colour swatches, s = stepper), options, group]
      ROWS = [["Skin",0,"c",SKIN,0],["Expression",3,"s",EY_N,0],["Makeup",11,"s",MK_N,0],["Facial hair",5,"s",BD_N,0],["Extra",4,"s",AC_N,0],
              ["Hair style",1,"s",HS_N,1],["Hair colour",2,"c",HAIR,1],["Hat",8,"s",HT_N,1],["Hat colour",10,"c",PAL,1],
              ["Top",12,"s",TP_N,2],["Top colour",6,"c",FIT,2],["Background",7,"c",BGS,2]],
      AV_DEFAULT = [2,1,0,0,0,0,0,0,0,0,0,0,0];
  function slotLens(){ var l = []; ROWS.forEach(function(r){ l[r[1]] = r[3].length; }); l[9] = 1; return l; }   // slot 9 (old hijab) is retired
  function parseAv(str){
    if (!/^a:[0-9a-z]{8,13}$/.test(String(str||""))) return null;
    var L = slotLens(), s = str.slice(2), out = [], i;
    for (i = 0; i < L.length; i++) out.push(i < s.length ? (parseInt(s.charAt(i), 36) % L[i]) : 0);
    return out;
  }
  function encAv(c){ return "a:" + c.map(function(v){ return v.toString(36); }).join(""); }
  function avSvg(c){
    var sk = SKIN[c[0]], sh = SKIN_SH[c[0]], hc = HAIR[c[2]], fit = FIT[c[6]], bg = BGS[c[7]], pc = PAL[c[10]],
        hs = c[1], ey = c[3], ac = c[4], bd = c[5], ht = c[8], hj = c[9], mk = c[11], tp = c[12], hijab = hj > 0;
    var E = '#1b1230', mc = (mk === 2 || mk === 3) ? '#d6246e' : '#7a2a2a', mw = (mk === 2 || mk === 3) ? 2.8 : 2;
    var brow = 'fill="none" stroke="#2a1a12" stroke-opacity=".75" stroke-width="2" stroke-linecap="round"';
    var mouth = function(d){ return '<path d="'+d+'" fill="none" stroke="'+mc+'" stroke-width="'+mw+'" stroke-linecap="round"/>'; };
    var eyes = function(rx, ry, ty){ return '<g fill="'+E+'"><ellipse cx="42" cy="'+ty+'" rx="'+rx+'" ry="'+ry+'"/><ellipse cx="58" cy="'+ty+'" rx="'+rx+'" ry="'+ry+'"/></g>'; };
    var o = '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="100" height="100" fill="'+bg+'"/><circle cx="50" cy="38" r="46" fill="#fff" fill-opacity=".07"/>';
    var LONG = '<path d="M27 46C23 72 28 86 35 88L65 88C72 86 77 72 73 46C73 20 60 14 50 14C40 14 27 20 27 46Z" fill="'+hc+'"/>';
    // hair behind the head (hidden by a hijab)
    if (!hijab) {
      if (hs === 4 || hs === 16) o += LONG;
      if (hs === 5) o += '<ellipse cx="50" cy="36" rx="29" ry="25" fill="'+hc+'"/>';
      if (hs === 8) o += '<path d="M27 46C24 62 26 67 30 69L70 69C74 67 76 62 73 46C73 20 60 14 50 14C40 14 27 20 27 46Z" fill="'+hc+'"/>';
      if (hs === 9) o += '<path d="M66 30C90 26 94 56 78 72C85 56 81 45 66 41Z" fill="'+hc+'"/><circle cx="68" cy="34" r="3" fill="#ff2f6d"/>';
      if (hs === 10) o += '<ellipse cx="21" cy="55" rx="8" ry="15" fill="'+hc+'" transform="rotate(12 21 55)"/><ellipse cx="79" cy="55" rx="8" ry="15" fill="'+hc+'" transform="rotate(-12 79 55)"/><circle cx="26" cy="41" r="3" fill="#ff2f6d"/><circle cx="74" cy="41" r="3" fill="#ff2f6d"/>';
      if (hs === 17 || hs === 23) o += '<path d="M27 46C25 58 28 65 32 65L68 65C72 65 75 58 73 46C73 22 60 13 50 13C40 13 27 22 27 46Z" fill="'+hc+'"/>';
      if (hs === 19) o += '<path d="M27 46C24 66 30 75 38 77L62 77C70 75 76 66 73 46C73 20 60 13 50 13C40 13 27 20 27 46Z" fill="'+hc+'"/>';
      if (hs === 12) o += '<path d="M25 46C20 64 28 70 24 82C30 91 36 84 40 89L60 89C64 84 70 91 76 82C72 70 80 64 75 46C75 20 60 14 50 14C40 14 25 20 25 46Z" fill="'+hc+'"/>';
    }
    // neck, shoulders, top
    o += '<rect x="43" y="60" width="14" height="20" rx="5" fill="'+sh+'"/>';
    o += '<path d="M12 100C12 82 28 74 50 74C72 74 88 82 88 100Z" fill="'+fit+'"/>';
    if (tp === 0) o += '<path d="M41 74L50 86L59 74Z" fill="'+sh+'"/><text x="50" y="97" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="8" fill="#fff" fill-opacity=".8">XO</text>';
    if (tp === 1) o += '<path d="M42 74L50 82L58 74Z" fill="'+sh+'"/><path d="M29 77C34 66 66 66 71 77L67 87C60 82 40 82 33 87Z" fill="#000" fill-opacity=".22"/><path d="M45 83V95M55 83V95" stroke="#fff" stroke-opacity=".75" stroke-width="1.6" stroke-linecap="round"/>';
    if (tp === 2) o += '<path d="M42 74L50 92L58 74Z" fill="#f4f4f8"/><path d="M42 74L35 98M58 74L65 98" stroke="#000" stroke-opacity=".28" stroke-width="2" stroke-linecap="round"/><path d="M48.2 80H51.8L53 96L50 99L47 96Z" fill="#ff2f6d"/>';
    if (tp === 3) o += '<path d="M41 74L50 84L59 74Z" fill="'+sh+'"/><path d="M14 88H86M13 93H87" stroke="#fff" stroke-opacity=".75" stroke-width="2.4"/><text x="50" y="99.5" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="8" fill="#fff" fill-opacity=".9">10</text>';
    if (tp === 4) o += '<path d="M38 74Q50 90 62 74Z" fill="'+sh+'"/>';
    // hijab: back drape (over the shoulders)
    if (hj === 1) o += '<path d="M23 50C21 14 79 14 77 50C77 62 80 70 82 78L18 78C20 70 23 62 23 50Z" fill="'+pc+'"/>';
    if (hj === 2) o += '<path d="M23 50C21 14 79 14 77 50C77 66 90 80 96 100L4 100C10 80 23 66 23 50Z" fill="'+pc+'"/>';
    // ears and head
    if (!(hj === 1 || hj === 2)) o += '<circle cx="29.5" cy="47" r="4" fill="'+sk+'"/><circle cx="70.5" cy="47" r="4" fill="'+sk+'"/>';
    o += '<ellipse cx="50" cy="46" rx="21" ry="24" fill="'+sk+'"/>';
    o += '<circle cx="35" cy="54" r="4" fill="#ff6b7a" fill-opacity="'+(mk ? '.26' : '.16')+'"/><circle cx="65" cy="54" r="4" fill="#ff6b7a" fill-opacity="'+(mk ? '.26' : '.16')+'"/>';
    // facial hair
    if (bd === 1) o += '<path d="M29 48C29 68 38 76 50 76C62 76 71 68 71 48C68 60 60 66 50 66C40 66 32 60 29 48Z" fill="'+hc+'" fill-opacity=".28"/>';
    if (bd === 2) o += '<path d="M29 48C29 68 38 76 50 76C62 76 71 68 71 48L67 48C66 60 60 64 50 64C40 64 34 60 33 48Z" fill="'+hc+'"/><path d="M44 55.5Q50 53 56 55.5" fill="none" stroke="'+hc+'" stroke-width="2.4" stroke-linecap="round"/>';
    if (bd === 5) o += '<path d="M29 48C27 76 40 86 50 86C60 86 73 76 71 48L67 48C66 60 60 65 50 65C40 65 34 60 33 48Z" fill="'+hc+'"/>';
    if (bd === 3 || bd === 4 || bd === 5) o += '<path d="M38 54C43 49 48 52 50 53C52 52 57 49 62 54C57 56 52 55 50 54C48 55 43 56 38 54Z" fill="'+hc+'"/>';
    if (bd === 4) o += '<path d="M43 63Q50 76 57 63Q50 67 43 63Z" fill="'+hc+'"/>';
    // hair in front
    if (!hijab) {
      var FRINGE = '<path d="M29 44C27 26 37 17 50 17C63 17 73 26 71 44C67 34 59 29 50 29C41 29 33 34 29 44Z" fill="'+hc+'"/>';
      var H = [ "", FRINGE,
        '<path d="M30 40C31 26 40 21 50 21C60 21 69 26 70 40C66 33 59 30 50 30C41 30 34 33 30 40Z" fill="'+hc+'"/>',
        '<path d="M29 44C25 24 36 11 53 12C69 13 75 27 71 44C67 35 59 31 47 31C39 31 33 35 29 44Z" fill="'+hc+'"/>',
        '<path d="M29 48C27 26 37 17 50 17C63 17 73 26 71 48C68 36 58 29 46 31C38 32 32 38 29 48Z" fill="'+hc+'"/>',
        '<path d="M31 40C33 28 41 24 50 24C59 24 67 28 69 40C64 33 58 31 50 31C42 31 36 33 31 40Z" fill="'+hc+'"/>',
        '<circle cx="50" cy="12" r="8" fill="'+hc+'"/>' + FRINGE,
        '<path d="M29 42L28 24L38 30L41 12L50 26L59 12L62 30L72 24L71 42C66 33 59 30 50 30C41 30 34 33 29 42Z" fill="'+hc+'"/>',
        '<path d="M29 40C28 24 38 17 50 17C62 17 72 24 71 40C64 33 36 33 29 40Z" fill="'+hc+'"/>',
        FRINGE,
        '<ellipse cx="35" cy="17" rx="8" ry="7" fill="'+hc+'" transform="rotate(-20 35 17)"/><ellipse cx="65" cy="17" rx="8" ry="7" fill="'+hc+'" transform="rotate(20 65 17)"/><path d="M29 44C27 26 37 18 50 18C63 18 73 26 71 44C67 34 59 30 50 30C41 30 33 34 29 44Z" fill="'+hc+'"/>',
        '<path d="M29 46C27 26 37 17 50 17C63 17 73 26 71 46C68 36 58 29 46 31C38 32 32 38 29 46Z" fill="'+hc+'"/><g fill="'+hc+'"><circle cx="71" cy="64" r="5"/><circle cx="72.5" cy="72" r="5"/><circle cx="71" cy="80" r="5"/><circle cx="72.5" cy="88" r="4.6"/></g><rect x="68" y="76" width="7" height="2.4" rx="1" fill="#ff2f6d"/>',
        '<path d="M29 46C27 26 37 17 50 17C63 17 73 26 71 46C68 36 58 29 46 31C38 32 32 38 29 46Z" fill="'+hc+'"/>',
        '<path d="M44 26L45 6L50 1L55 6L56 26Z" fill="'+hc+'"/><path d="M30 38C32 29 42 25 50 25C58 25 68 29 70 38C66 31 34 31 30 38Z" fill="'+hc+'" fill-opacity=".3"/>',
        '<path d="M29 46C26 24 40 14 56 15C70 16 74 30 71 46C70 38 62 28 38 34C34 36 31 40 29 46Z" fill="'+hc+'"/>',
        '<circle cx="34" cy="15" r="8.5" fill="'+hc+'"/><circle cx="66" cy="15" r="8.5" fill="'+hc+'"/>' + FRINGE,
        '<path d="M29 44C27 24 37 16 50 16C63 16 73 24 71 44C70 38 66 36 62 38C56 34 44 34 38 38C34 36 30 38 29 44Z" fill="'+hc+'"/>',
        // 17 Bollywood wave: big swept-up volume, loose lock falling on the forehead
        '<path d="M28 46C23 22 38 8 55 9C71 10 77 26 72 46C71 38 68 33 62 31C56 27 46 27 40 31C34 34 30 40 28 46Z" fill="'+hc+'"/><path d="M61 25C52 23 41 28 40 39C46 33 55 32 64 34Z" fill="'+hc+'"/><path d="M35 20C44 11 59 11 67 18" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="2" stroke-linecap="round"/>',
        // 18 Slick back
        '<path d="M29 46C27 26 38 15 50 15C62 15 73 26 71 46C69 38 66 33 60 30C50 24 40 28 36 33C32 36 30 40 29 46Z" fill="'+hc+'"/><path d="M37 24Q50 16 63 24M34 29Q50 20 67 29" fill="none" stroke="#fff" stroke-opacity=".2" stroke-width="1.3" stroke-linecap="round"/>',
        // 19 Swept back long (90s)
        '<path d="M28 46C25 24 38 10 52 10C68 10 75 26 72 46C70 36 64 30 56 27C46 23 38 28 34 34C31 38 29 42 28 46Z" fill="'+hc+'"/><path d="M33 23Q46 12 63 19M31 30Q46 17 68 27" fill="none" stroke="#fff" stroke-opacity=".17" stroke-width="1.4" stroke-linecap="round"/>',
        // 20 Tousled quiff
        '<path d="M29 44C25 28 32 16 40 14L43 7L48 14L53 5L57 14L64 9L64 17C72 22 73 34 71 44C68 36 62 31 50 31C40 31 33 35 29 44Z" fill="'+hc+'"/>',
        // 21 Pompadour
        '<path d="M28 44C21 18 38 3 58 6C75 9 77 28 72 44C70 36 64 31 52 31C42 31 34 35 28 44Z" fill="'+hc+'"/><path d="M36 19C44 9 60 9 69 18" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="2" stroke-linecap="round"/>',
        // 22 Undercut with a longer top
        '<path d="M33 38C32 20 44 11 58 13C70 15 72 26 70 36C64 29 54 25 46 28C40 30 35 33 33 38Z" fill="'+hc+'"/><path d="M29 47C27 34 33 28 36 34C33 38 31 42 31 49Z M71 47C73 34 67 28 64 34C67 38 69 42 69 49Z" fill="'+hc+'" fill-opacity=".32"/>',
        // 23 Wavy fringe
        '<path d="M28 46C25 24 36 13 50 13C64 13 75 24 72 46C71 38 67 35 62 35C58 30 54 37 50 31C46 37 42 30 38 35C33 35 29 38 28 46Z" fill="'+hc+'"/>',
        // 24 Man bun
        '<circle cx="50" cy="10" r="8.5" fill="'+hc+'"/><rect x="43.5" y="16" width="13" height="2.6" rx="1.3" fill="#ff2f6d"/><path d="M29 46C27 26 38 15 50 15C62 15 73 26 71 46C69 38 66 33 60 30C50 24 40 28 36 33C32 36 30 40 29 46Z" fill="'+hc+'"/><path d="M37 24Q50 16 63 24" fill="none" stroke="#fff" stroke-opacity=".2" stroke-width="1.3" stroke-linecap="round"/>',
        // 25 Side part
        '<path d="M28 46C25 26 38 16 52 16C68 16 74 28 71 46C70 38 65 32 58 31C50 30 42 30 38 32C32 35 29 40 28 46Z" fill="'+hc+'"/><path d="M45 17Q43 25 38 32" fill="none" stroke="#000" stroke-opacity=".3" stroke-width="1.3" stroke-linecap="round"/>' ];
      o += H[hs] || "";
    }
    // hijab: frame around the face
    if (hj === 1 || hj === 2) o += '<path fill-rule="evenodd" d="M22 52C20 14 80 14 78 52C78 66 70 79 50 79C30 79 22 66 22 52Z M31.5 47a18.5 22 0 1 0 37 0a18.5 22 0 1 0 -37 0Z" fill="'+pc+'"/><ellipse cx="50" cy="47" rx="18.5" ry="22" fill="none" stroke="#000" stroke-opacity=".16" stroke-width="1.4"/><path d="M24 32C32 20 68 20 76 32M26 66C34 76 66 76 74 66" fill="none" stroke="#000" stroke-opacity=".12" stroke-width="1.6" stroke-linecap="round"/>';
    if (hj === 3) o += '<path d="M27 41C23 12 77 12 73 41C66 31 34 31 27 41Z" fill="'+pc+'"/><path d="M29 36C42 23 62 25 72 36M30 29C44 17 64 20 71 29M36 21C46 30 60 30 66 21" fill="none" stroke="#000" stroke-opacity=".18" stroke-width="2"/>';
    // face
    if (ey === 0) o += eyes(2.6,3.2,47) + '<g fill="#fff"><circle cx="43" cy="45.8" r=".9"/><circle cx="59" cy="45.8" r=".9"/></g><path d="M37 40Q42 37 47 40M53 40Q58 37 63 40" '+brow+'/>' + mouth('M43 57Q50 64 57 57');
    if (ey === 1) o += eyes(2.8,2,47.5) + '<path d="M37 42.5H47M53 42.5H63" '+brow+'/>' + mouth('M44 58Q51 61 58 56.5');
    if (ey === 2) o += '<ellipse cx="42" cy="47" rx="2.6" ry="3.2" fill="'+E+'"/><path d="M54.5 47.5Q58 44 61.5 47.5" fill="none" stroke="'+E+'" stroke-width="2.2" stroke-linecap="round"/><path d="M37 40Q42 37 47 40M53 41Q58 38.5 63 40" '+brow+'/><path d="M43 56.5Q50 66 57 56.5Z" fill="#7a1f2b"/>';
    if (ey === 3) o += eyes(3.2,4,47) + '<g fill="#fff"><circle cx="43.2" cy="45.4" r="1.1"/><circle cx="59.2" cy="45.4" r="1.1"/></g><path d="M37 38Q42 35 47 38M53 38Q58 35 63 38" '+brow+'/><ellipse cx="50" cy="60" rx="4" ry="4.6" fill="#5b1a24"/>';
    if (ey === 4) o += '<path d="M37.5 47Q42 42.5 46.5 47M53.5 47Q58 42.5 62.5 47" fill="none" stroke="'+E+'" stroke-width="2.2" stroke-linecap="round"/><path d="M37 39Q42 36 47 39M53 39Q58 36 63 39" '+brow+'/><path d="M42 55Q50 70 58 55Z" fill="#5b1a24"/><path d="M43.4 56.3H56.6" stroke="#fff" stroke-width="2"/>';
    if (ey === 5) o += eyes(2.4,2.6,48) + '<path d="M36.5 39L47 43M63.5 39L53 43" fill="none" stroke="#2a1a12" stroke-opacity=".85" stroke-width="2.4" stroke-linecap="round"/>' + mouth('M43 61Q50 56 57 61');
    if (ey === 6) o += eyes(2.5,3,48) + '<g fill="#fff"><circle cx="43" cy="46.8" r=".8"/><circle cx="59" cy="46.8" r=".8"/></g><path d="M37 42L47 39M63 42L53 39" '+brow+'/><path d="M64 52Q66.5 56.5 64 58.5Q61.5 56.5 64 52Z" fill="#6ec6ff"/>' + mouth('M43 61Q50 56 57 61');
    if (ey === 7) o += eyes(2.6,3.2,47) + '<g fill="#fff"><circle cx="43" cy="45.8" r=".9"/><circle cx="59" cy="45.8" r=".9"/></g><path d="M37 40Q42 37 47 40M53 40Q58 37 63 40" '+brow+'/><path d="M43 56Q50 66 57 56Z" fill="#7a1f2b"/><path d="M47 60.5Q50 69.5 53 60.5Q50 62.5 47 60.5Z" fill="#ff7a93"/>';
    if (ey === 8) o += '<path d="M42 51.5C36 47 37 42.5 42 44.5C47 42.5 48 47 42 51.5Z M58 51.5C52 47 53 42.5 58 44.5C63 42.5 64 47 58 51.5Z" fill="#ff2f6d"/><path d="M37 39Q42 36 47 39M53 39Q58 36 63 39" '+brow+'/>' + mouth('M42 57Q50 66 58 57');
    if (ey === 9) o += '<path d="M38 47Q42 50.5 46 47M54 47Q58 50.5 62 47" fill="none" stroke="'+E+'" stroke-width="2.2" stroke-linecap="round"/><path d="M37 41H47M53 41H63" '+brow+'/>' + mouth('M46 59.5Q50 61.5 54 59.5') + '<text x="68" y="30" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="9" fill="#fff" fill-opacity=".85">z</text>';
    if (mk === 1 || mk === 2) o += '<path d="M38.4 44.6L35.6 42.2M40.6 43.4L39 40.4M43.8 43.2L43.6 40.2M61.6 44.6L64.4 42.2M59.4 43.4L61 40.4M56.2 43.2L56.4 40.2" stroke="'+E+'" stroke-width="1.5" stroke-linecap="round"/>';
    // accessories
    if (ac === 1) o += '<g fill="#fff" fill-opacity=".1" stroke="#161625" stroke-width="2"><circle cx="42" cy="47" r="7.5"/><circle cx="58" cy="47" r="7.5"/></g><path d="M49.5 46.5Q50 45 50.5 46.5M34.5 46L30 44M65.5 46L70 44" fill="none" stroke="#161625" stroke-width="2" stroke-linecap="round"/>';
    if (ac === 2) o += '<rect x="33" y="41.5" width="16" height="11" rx="4.5" fill="#10101c"/><rect x="51" y="41.5" width="16" height="11" rx="4.5" fill="#10101c"/><path d="M49 45H51M33 44L29.5 42.5M67 44L70.5 42.5" stroke="#10101c" stroke-width="2" stroke-linecap="round"/><path d="M36 44.5H40M54 44.5H58" stroke="#00f3ff" stroke-opacity=".8" stroke-width="1.6" stroke-linecap="round"/>';
    if (ac === 3) o += '<path d="M28 38C28 14 72 14 72 38Z" fill="'+fit+'"/><path d="M26 38H80Q82 43.5 74 43.5H26Z" fill="'+fit+'"/><path d="M26 38H80" stroke="#000" stroke-opacity=".18" stroke-width="1.5"/><circle cx="50" cy="17.5" r="2" fill="#fff" fill-opacity=".7"/>';
    if (ac === 4) o += '<path d="M26 48C24 12 76 12 74 48" fill="none" stroke="#1c1c2e" stroke-width="4.5" stroke-linecap="round"/><rect x="21.5" y="42" width="8.5" height="16" rx="4.2" fill="#00c8e0"/><rect x="70" y="42" width="8.5" height="16" rx="4.2" fill="#00c8e0"/>';
    if (ac === 5) o += '<g fill="#fff" fill-opacity=".12" stroke="#d9a441" stroke-width="1.5"><circle cx="42" cy="47" r="6.6"/><circle cx="58" cy="47" r="6.6"/></g><path d="M48.6 46.6Q50 45 51.4 46.6M35.4 46L31 44.5M64.6 46L69 44.5" fill="none" stroke="#d9a441" stroke-width="1.5" stroke-linecap="round"/>';
    if (ac === 6) o += '<path d="M42 54C33 48 34 40 42 43.5C50 40 51 48 42 54Z M58 54C49 48 50 40 58 43.5C66 40 67 48 58 54Z" fill="#ff5fa2" fill-opacity=".85" stroke="#c71f6b" stroke-width="1.2"/><path d="M49.5 45H50.5" stroke="#c71f6b" stroke-width="1.6"/>';
    if (ac === 7) o += '<g fill="none" stroke="#f5b800" stroke-width="1.8"><circle cx="29.5" cy="55" r="3.6"/><circle cx="70.5" cy="55" r="3.6"/></g>';
    if (ac === 8) o += '<path d="M30 50C38 48 62 48 70 50L68 64C62 74 38 74 32 64Z" fill="#e8f1fb"/><path d="M33 56H67M34 62H66" stroke="#9db8d6" stroke-width="1" stroke-opacity=".7"/><path d="M30 50L27 47M70 50L73 47" stroke="#e8f1fb" stroke-width="1.4" stroke-linecap="round"/>';
    if (ac === 9) o += '<path d="M28 36L72 56" stroke="#17171c" stroke-width="1.6"/><ellipse cx="42" cy="47" rx="6.4" ry="5.6" fill="#17171c" transform="rotate(14 42 47)"/>';
    if (ac === 10) o += '<path d="M50 81L40 75V87Z M50 81L60 75V87Z" fill="#ff2f6d"/><circle cx="50" cy="81" r="2.6" fill="#c71f55"/>';
    if (ac === 11) o += '<g fill="#ff7ab8"><circle cx="64" cy="22.5" r="3.4"/><circle cx="68.3" cy="25.6" r="3.4"/><circle cx="66.6" cy="30.6" r="3.4"/><circle cx="61.4" cy="30.6" r="3.4"/><circle cx="59.7" cy="25.6" r="3.4"/></g><circle cx="64" cy="27" r="2.4" fill="#ffd23f"/>';
    if (ac === 12) o += '<g fill="#a85a2a" fill-opacity=".6"><circle cx="37" cy="52" r=".9"/><circle cx="40.5" cy="54.5" r=".9"/><circle cx="35" cy="56" r=".9"/><circle cx="43" cy="52.5" r=".8"/><circle cx="63" cy="52" r=".9"/><circle cx="59.5" cy="54.5" r=".9"/><circle cx="65" cy="56" r=".9"/><circle cx="57" cy="52.5" r=".8"/></g>';
    // hats (drawn last, on top of everything)
    var Hh = ["",
      '<path d="M34 29C33 15 40 8 50 10C60 8 67 15 66 29Z" fill="'+pc+'"/><path d="M34 25H66V29H34Z" fill="#000" fill-opacity=".32"/><path d="M8 28Q22 40 50 37Q78 40 92 28Q80 27 50 30Q20 27 8 28Z" fill="'+pc+'" stroke="#000" stroke-opacity=".22" stroke-width="1"/>',
      '<path d="M29 34C27 11 73 11 71 34Z" fill="'+pc+'"/><path d="M28.5 29H71.5V35Q50 38 28.5 35Z" fill="'+pc+'"/><path d="M28.5 29H71.5V35Q50 38 28.5 35Z" fill="#000" fill-opacity=".2"/><circle cx="50" cy="10.5" r="5.5" fill="'+pc+'"/><circle cx="50" cy="10.5" r="5.5" fill="#fff" fill-opacity=".25"/>',
      '<path d="M33 31L35 14H65L67 31Z" fill="'+pc+'"/><path d="M20 31Q50 37 80 31L77 35Q50 40 23 35Z" fill="'+pc+'" stroke="#000" stroke-opacity=".2" stroke-width="1"/>',
      '<path d="M35 28L37 3H63L65 28Z" fill="#17171c"/><path d="M36.5 22H63.5V27H36.5Z" fill="'+pc+'"/><path d="M24 29Q50 35 76 29V33Q50 39 24 33Z" fill="#17171c"/>',
      '<path d="M31 27L32 11L41 19L50 7L59 19L68 11L69 27Z" fill="#f5c518" stroke="#b8860b" stroke-width="1.2" stroke-linejoin="round"/><circle cx="41" cy="23" r="2" fill="#ff2f6d"/><circle cx="50" cy="23" r="2" fill="#3b82f6"/><circle cx="59" cy="23" r="2" fill="#1fd077"/>',
      '<path d="M25 30C22 12 55 4 74 20C79 26 72 32 63 30C50 27 36 34 25 30Z" fill="'+pc+'"/><path d="M62 13L66 8" stroke="'+pc+'" stroke-width="3" stroke-linecap="round"/>',
      '<path d="M16 31Q18 10 50 8Q82 10 84 31Q50 24 16 31Z" fill="#17171c"/><path d="M20 28Q50 21 80 28" fill="none" stroke="#c9a227" stroke-width="2"/><circle cx="50" cy="16" r="4" fill="#f4f4f8"/><rect x="48" y="19" width="4" height="3" fill="#f4f4f8"/><circle cx="48.6" cy="15.6" r="1" fill="#17171c"/><circle cx="51.4" cy="15.6" r="1" fill="#17171c"/>',
      '<g fill="#f7f7fb"><circle cx="38" cy="17" r="10"/><circle cx="50" cy="12" r="11"/><circle cx="62" cy="17" r="10"/><rect x="33" y="18" width="34" height="14"/></g><path d="M33 28H67" stroke="#000" stroke-opacity=".12" stroke-width="2"/>',
      '<path d="M38 29L50 1L62 29Z" fill="'+pc+'"/><path d="M42.5 21H57.5M45.5 13H54.5" stroke="#fff" stroke-opacity=".7" stroke-width="2"/><circle cx="50" cy="2.5" r="3" fill="#ffd23f"/><path d="M38 29L31 48M62 29L69 48" stroke="#fff" stroke-opacity=".5" stroke-width=".9"/>',
      '<path d="M28 33C28 12 72 12 72 33Z" fill="'+pc+'"/><path d="M46 14H54V31H46Z" fill="#000" fill-opacity=".16"/><path d="M24 33H76V37H24Z" fill="'+pc+'"/><path d="M24 33H76V37H24Z" fill="#000" fill-opacity=".16"/>',
      '<path d="M29 31L50 2L71 31Z" fill="'+pc+'"/><path d="M18 33Q50 41 82 33Q50 27 18 33Z" fill="'+pc+'"/><path d="M50 14L51.8 18.4L56.5 18.7L52.9 21.7L54 26.3L50 23.8L46 26.3L47.1 21.7L43.5 18.7L48.2 18.4Z" fill="#ffd23f"/>',
      '<path d="M29 32C28 10 56 2 66 16C72 21 72 28 71 32Z" fill="#e52b3a"/><path d="M27 32H73V37Q50 40 27 37Z" fill="#f7f7fb"/><circle cx="67" cy="15" r="5" fill="#f7f7fb"/>',
      '<path d="M29 33Q50 27 71 33L71 37Q50 31 29 37Z" fill="'+pc+'"/>',
      '<path d="M28 36C28 18 72 18 72 36Q50 31 28 36Z" fill="'+pc+'"/><g fill="#fff" fill-opacity=".8"><circle cx="40" cy="26" r="1.3"/><circle cx="50" cy="23" r="1.3"/><circle cx="60" cy="26" r="1.3"/><circle cx="45" cy="30" r="1.3"/><circle cx="55" cy="30" r="1.3"/></g><path d="M70 33L82 28L80 40Z" fill="'+pc+'"/>',
      '<path d="M34 29C34 14 66 14 66 29Z" fill="#e8c878"/><path d="M34 25H66V29H34Z" fill="'+pc+'"/><path d="M10 29Q50 46 90 29Q50 33 10 29Z" fill="#d9b45f"/>',
      '<path d="M16 19L50 8L84 19L50 30Z" fill="#17171c"/><path d="M34 24V34Q50 40 66 34V24L50 29Z" fill="#23232f"/><path d="M80 20V33" stroke="'+pc+'" stroke-width="1.6"/><circle cx="80" cy="34" r="2.2" fill="'+pc+'"/>'];
    o += Hh[ht] || "";
    return o + '</svg>';
  }
  function avHTML(av, photo, name){
    if (av === "photo" && /^data:image\/(jpeg|png|webp);base64,/.test(photo || "")) return '<img alt="" src="'+photo+'">';
    var c = parseAv(av); if (c) return avSvg(c);
    if (av) return esc(av);
    return esc((name || "?").charAt(0).toUpperCase());
  }
  function readPhoto(file, cb){
    var r = new FileReader();
    r.onerror = function(){ cb(null); };
    r.onload = function(){
      var im = new Image();
      im.onerror = function(){ cb(null); };
      im.onload = function(){
        var S = 112, cv = document.createElement("canvas"), m = Math.min(im.width, im.height);
        cv.width = cv.height = S;
        cv.getContext("2d").drawImage(im, (im.width - m) / 2, (im.height - m) / 2, m, m, 0, 0, S, S);
        cb(cv.toDataURL("image/jpeg", .8));
      };
      im.src = r.result;
    };
    r.readAsDataURL(file);
  }

  // ---- profile bar ----
  function divInfo(){
    var st = {}; try { st = JSON.parse(g("xo_league_v2")||"{}"); } catch(e){}
    var dv = DIVS.filter(function(x){ return x.id === st.divId; })[0];
    return { st: st, name: dv ? dv.name : "Iron", color: dv ? dv.color : "#888" };
  }
  var BAR_CSS = [
    ".xo-wait body{visibility:hidden}",
    "#xoBar{position:fixed;top:12px;right:12px;z-index:900;font-family:'Segoe UI',system-ui,sans-serif;color:#fff;-webkit-tap-highlight-color:transparent}",
    "#xoBar *{box-sizing:border-box}",
    "#xoChip{display:flex;align-items:center;gap:10px;padding:4px 12px 4px 4px;border-radius:50px;border:1px solid rgba(255,255,255,.14);background:linear-gradient(135deg,rgba(32,24,64,.8),rgba(10,8,26,.8));-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);cursor:pointer;box-shadow:0 6px 22px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.08);transition:border-color .25s,transform .25s}",
    "#xoChip:hover,#xoChip:focus-visible,#xoBar.open #xoChip{border-color:rgba(157,107,255,.75);outline:none}",
    "#xoChip:hover{transform:translateY(-1px)}",
    ".xo-av{width:40px;height:40px;border-radius:50%;overflow:hidden;display:grid;place-items:center;flex:none;font-weight:900;font-size:20px;line-height:1;background:linear-gradient(135deg,#7c3aed,#12c8d9);box-shadow:0 0 0 2px var(--xr,#9d6bff),0 0 0 4px rgba(0,0,0,.35)}",
    ".xo-av svg,.xo-av img{width:100%;height:100%;display:block;object-fit:cover}",
    ".xo-who{min-width:0;display:flex;flex-direction:column;gap:3px}",
    ".xo-nm{font-weight:800;font-size:14px;line-height:1;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".xo-sub{display:flex;align-items:center;gap:6px;font-size:11px;line-height:1;opacity:.85;letter-spacing:.4px;white-space:nowrap}",
    ".xo-pill{display:inline-block;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:var(--c,#aaa);background:rgba(255,255,255,.06);border:1px solid var(--c,#aaa)}",
    ".xo-car{width:8px;height:8px;border-right:2px solid rgba(255,255,255,.55);border-bottom:2px solid rgba(255,255,255,.55);transform:rotate(45deg) translateY(-2px);transition:transform .25s;margin-left:2px;flex:none}",
    "#xoBar.open .xo-car{transform:rotate(-135deg) translateY(-2px)}",
    "#xoPanel{display:none;position:absolute;right:0;top:calc(100% + 10px);width:min(332px,calc(100vw - 24px));max-height:calc(100vh - 92px);max-height:calc(100dvh - 92px);overflow-y:auto;padding:16px;border-radius:22px;border:1px solid rgba(157,107,255,.35);background:linear-gradient(180deg,rgba(24,18,52,.98),rgba(9,7,22,.98));box-shadow:0 24px 60px rgba(0,0,0,.6),0 0 0 1px rgba(0,0,0,.4)}",
    "#xoBar.open #xoPanel{display:block;animation:xoPop .18s ease-out}",
    "@keyframes xoPop{from{opacity:0;transform:translateY(-6px) scale(.98)}to{opacity:1;transform:none}}",
    "#xoPanel::-webkit-scrollbar{width:6px}#xoPanel::-webkit-scrollbar-thumb{background:rgba(255,255,255,.18);border-radius:6px}",
    ".xo-head{display:flex;align-items:center;gap:14px;margin-bottom:14px}",
    ".xo-big{width:76px;height:76px;border-radius:50%;overflow:hidden;display:grid;place-items:center;flex:none;font-size:38px;font-weight:900;background:linear-gradient(135deg,#7c3aed,#12c8d9);box-shadow:0 0 0 3px var(--xr,#9d6bff),0 8px 24px rgba(0,0,0,.5)}",
    ".xo-big svg,.xo-big img{width:100%;height:100%;display:block;object-fit:cover}",
    ".xo-hi{flex:1;min-width:0}",
    ".xo-lbl{display:block;margin:0 0 5px;font-size:10px;letter-spacing:1.6px;font-weight:700;opacity:.5;text-transform:uppercase}",
    ".xo-in{width:100%;padding:9px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.05);color:#fff;font-size:14px;font-weight:700;outline:none;transition:border-color .2s}",
    ".xo-in:focus{border-color:rgba(18,200,217,.8)}",
    ".xo-idrow{display:flex;align-items:center;gap:8px;margin-top:8px;font-size:12px;opacity:.9}",
    ".xo-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:14px}",
    ".xo-stats div{padding:8px 0 7px;border-radius:12px;background:rgba(255,255,255,.05);text-align:center}",
    ".xo-stats b{display:block;font-size:16px;line-height:1.1}.xo-stats span{font-size:8px;letter-spacing:.8px;opacity:.55}",
    ".xo-hist{margin:-4px 0 14px;border-radius:12px;background:rgba(255,255,255,.04);padding:8px 12px;font-size:12px}",
    ".xo-hist summary{cursor:pointer;font-weight:700;opacity:.85;list-style:none;outline:none}.xo-hist summary::-webkit-details-marker{display:none}",
    ".xo-hist summary::after{content:'▾';float:right;opacity:.6}.xo-hist[open] summary::after{content:'▴'}",
    ".xo-chips{display:flex;flex-wrap:wrap;gap:5px;margin:10px 0 4px}",
    ".xo-chip{display:inline-grid;place-items:center;width:21px;height:21px;border-radius:50%;font:800 10px 'Segoe UI',sans-serif;font-style:normal;color:#06101a}",
    ".xo-chip.w{background:#1fd077}.xo-chip.d{background:#9aa6c0}.xo-chip.l{background:#ff4f7d}",
    ".xo-modes{display:grid;grid-template-columns:1fr 1fr;gap:6px 14px;margin-top:8px}",
    ".xo-modes div{display:flex;justify-content:space-between;gap:6px}.xo-modes span{opacity:.6}",
    ".xo-tabs{display:flex;gap:4px;padding:3px;margin-bottom:12px;border-radius:50px;background:rgba(255,255,255,.05)}",
    ".xo-tabs button{flex:1;padding:8px 4px;border:0;border-radius:50px;background:transparent;color:#fff;font:700 12px 'Segoe UI',sans-serif;letter-spacing:.4px;cursor:pointer;opacity:.55;transition:.2s}",
    ".xo-tabs button.on{background:#7c3aed;opacity:1;box-shadow:0 2px 10px rgba(124,58,237,.5)}",
    ".xo-pane{display:none}.xo-pane.on{display:block}",
    ".xo-row{display:flex;align-items:center;gap:10px;padding:6px 0}",
    ".xo-row>label{width:84px;flex:none;font-size:11px;font-weight:700;opacity:.65;letter-spacing:.3px}",
    ".xo-sw{display:flex;flex-wrap:wrap;gap:5px;flex:1}",
    ".xo-sw button{width:20px;height:20px;border-radius:50%;border:2px solid transparent;padding:0;cursor:pointer;box-shadow:inset 0 0 0 1px rgba(255,255,255,.18);transition:transform .15s}",
    ".xo-sw button:hover{transform:scale(1.12)}.xo-sw button.on{border-color:#fff;transform:scale(1.12)}",
    ".xo-st{display:flex;align-items:center;flex:1;gap:6px}",
    ".xo-st button{width:26px;height:26px;border-radius:50%;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;font-size:15px;line-height:1;cursor:pointer;padding:0;transition:.2s}",
    ".xo-st button:hover{background:#7c3aed;border-color:#7c3aed}",
    ".xo-st span{flex:1;text-align:center;font-size:12px;font-weight:700}",
    ".xo-dice{margin-top:6px}",
    ".xo-sel{flex:1;min-width:0;padding:7px 10px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.07);color:#fff;font:700 12px 'Segoe UI',sans-serif;outline:none;cursor:pointer}",
    ".xo-sel:focus{border-color:#12c8d9}.xo-sel option{background:#1a1433;color:#fff}",
    ".xo-row.col{flex-direction:column;align-items:stretch;gap:7px}.xo-row.col>label{width:auto}",
    ".xo-grp{display:flex;gap:6px;margin-bottom:6px}",
    ".xo-grp button{flex:1;padding:7px 4px;border-radius:50px;border:1px solid rgba(255,255,255,.16);background:transparent;color:#fff;font:700 11px 'Segoe UI',sans-serif;cursor:pointer;opacity:.7;transition:.2s}",
    ".xo-grp button.on{background:rgba(18,200,217,.16);border-color:#12c8d9;opacity:1}",
    ".xo-ghost{width:100%;padding:9px 10px;border-radius:50px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.04);color:#fff;font:700 12px 'Segoe UI',sans-serif;cursor:pointer;transition:.2s}",
    ".xo-ghost:hover{background:rgba(255,255,255,.12)}.xo-ghost.warn:hover{background:rgba(255,47,109,.25);border-color:#ff2f6d}",
    ".xo-note{margin:0 0 10px;font-size:12px;line-height:1.5;opacity:.7}",
    ".xo-av-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:6px}",
    ".xo-av-grid button{aspect-ratio:1;border-radius:50%;border:2px solid transparent;background:rgba(255,255,255,.06);font-size:18px;cursor:pointer;padding:0;transition:.15s}",
    ".xo-av-grid button:hover{background:rgba(255,255,255,.14)}.xo-av-grid button.on{border-color:#12c8d9;background:rgba(18,200,217,.14)}",
    ".xo-msg{min-height:16px;margin:10px 0 2px;font-size:12px;color:#7be8f2;text-align:center}",
    ".xo-save{width:100%;padding:11px;border-radius:50px;border:0;background:linear-gradient(135deg,#7c3aed,#a24bff);color:#fff;font:800 13px 'Segoe UI',sans-serif;letter-spacing:.5px;cursor:pointer;box-shadow:0 6px 18px rgba(124,58,237,.4);transition:.2s}",
    ".xo-save:hover{filter:brightness(1.12)}",
    ".xo-two{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}",
    "@media(max-width:420px){.xo-nm{max-width:78px}.xo-row>label{width:74px}}",
    "@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}"
  ].join("\n");

  function mountBar(){
    var pr = {}; try { pr = JSON.parse(g("xo_profile")||"{}"); } catch(e){}
    var guest = !user && !(offline && g("xo_hint") && g("xo_hint") !== "guest"), name = guest ? "Guest" : (pr.name || "Player"), tag = guest ? "" : "#"+(pr.tag||"-----"), dv = divInfo();
    var css = document.createElement("style"); css.textContent = BAR_CSS; document.head.appendChild(css);
    var el = document.createElement("div"); el.id = "xoBar"; el.style.setProperty("--xr", dv.color);
    var chipAv = guest ? "👤" : avHTML(pr.avatar, pr.photo, name);
    var sub = guest ? "<span>Progress not saved</span>" : '<span id="xoTag">'+tag+'</span><span class="xo-pill" style="--c:'+dv.color+'">'+dv.name+'</span>';
    // totals: every mode that reports results, else the league's own lifetime record
    var ss = {}; try { ss = JSON.parse(g("xo_stats")||"{}"); } catch(e){}
    var cr = dv.st.career || { w:dv.st.wins||0, d:dv.st.draws||0, l:dv.st.losses||0 };
    var rec = (ss.w||ss.d||ss.l) ? { w:ss.w||0, d:ss.d||0, l:ss.l||0 } : { w:cr.w||0, d:cr.d||0, l:cr.l||0 };
    var MODE_N = { league:"League", ai:"VS AI", local:"Local PvP", mystery:"Mystery", nomad:"Nomad", "online-classic":"Online Classic", "online-mystery":"Online Mystery", "online-nomad":"Online Nomad" };
    function histHTML(){
      var h = ss.h || [], ms = ss.m || {}, total = rec.w + rec.d + rec.l, played = ss.p || 0;
      if (!h.length && !Object.keys(ms).length) return '<p class="xo-note" style="margin:-6px 0 12px;text-align:center;font-size:11px">Your match history will show up here.</p>';
      var chips = h.filter(function(e){ return e[1] !== "p"; }).slice(0, 12).map(function(e){
        return '<i class="xo-chip '+e[1]+'" title="'+esc(MODE_N[e[0]] || e[0])+'">'+e[1].toUpperCase()+'</i>'; }).join("");
      var lines = Object.keys(ms).map(function(k){
        var m = ms[k], t = (m.w||0) + (m.d||0) + (m.l||0);
        return '<div><span>'+esc(MODE_N[k] || k)+'</span><b>'+(t ? (m.w||0)+' / '+(m.d||0)+' / '+(m.l||0) : (m.p||0)+' games')+'</b></div>';
      }).join("");
      return '<details class="xo-hist"><summary>Match history · '+(total + played)+' games'+(total ? ' · '+Math.round(100 * rec.w / total)+'% wins' : '')+'</summary>'+
        (chips ? '<div class="xo-chips">'+chips+'</div>' : '')+'<div class="xo-modes">'+lines+'</div></details>';
    }
    var panel;
    if (guest) {
      panel = '<p class="xo-note" style="font-size:13px;opacity:.85">You are playing as a guest. Create an account to keep your league progress and pick your character on any device.</p>'+
        '<button class="xo-save" id="xoCreate" type="button">Create account</button><div class="xo-two" style="grid-template-columns:1fr"><button class="xo-ghost" id="xoSignOut" type="button">Sign in instead</button></div>';
    } else {
      panel = '<div class="xo-head"><div class="xo-big" id="xoBig"></div><div class="xo-hi"><label class="xo-lbl" for="xoName">Display name</label><input class="xo-in" id="xoName" maxlength="14" value="'+esc(name)+'" autocomplete="off">'+
        '<div class="xo-idrow"><span>'+tag+'</span><span class="xo-pill" style="--c:'+dv.color+'">'+dv.name+'</span></div></div></div>'+
        '<div class="xo-stats"><div><b>'+rec.w+'</b><span>WINS</span></div><div><b>'+rec.d+'</b><span>DRAWS</span></div><div><b>'+rec.l+'</b><span>LOSSES</span></div><div><b>'+(dv.st.bestStreak||0)+'</b><span>BEST STREAK</span></div></div>'+histHTML()+'<div class="xo-tabs" role="tablist"><button type="button" data-m="a">Character</button><button type="button" data-m="p">Photo</button><button type="button" data-m="e">Emoji</button></div>'+
        '<div class="xo-pane" data-p="a"><div id="xoMaker"></div><button class="xo-ghost xo-dice" id="xoDice" type="button">🎲 Surprise me</button></div>'+
        '<div class="xo-pane" data-p="p"><p class="xo-note">Use a picture of yourself. It is cropped to a circle and kept small so it saves fast.</p>'+
          '<input type="file" id="xoFile" accept="image/*" style="display:none"><div class="xo-two"><button class="xo-ghost" id="xoPick" type="button">Choose photo</button><button class="xo-ghost warn" id="xoDrop" type="button">Remove</button></div></div>'+
        '<div class="xo-pane" data-p="e"><div class="xo-av-grid" id="xoAvs">'+AVATARS.map(function(a){return '<button type="button" data-a="'+a+'">'+a+'</button>';}).join("")+'</div></div>'+
        '<div class="xo-msg" id="xoMsg" role="status"></div>'+
        '<button class="xo-save" id="xoSave" type="button">Save changes</button>'+
        '<div class="xo-two"><button class="xo-ghost" id="xoCopy" type="button">Copy ID '+tag+'</button><button class="xo-ghost warn" id="xoSignOut" type="button">Sign out</button></div>';
    }
    el.innerHTML = '<div id="xoChip" tabindex="0" role="button" aria-label="Open profile"><div class="xo-av" id="xoAv">'+chipAv+'</div><div class="xo-who"><div class="xo-nm" id="xoNm">'+esc(name)+'</div><div class="xo-sub">'+sub+'</div></div><i class="xo-car"></i></div><div id="xoPanel">'+panel+'</div>';
    document.body.appendChild(el);
    var chip = el.querySelector("#xoChip");
    function tog(){ el.classList.toggle("open"); }
    chip.onclick = tog; chip.onkeydown = function(e){ if (e.key==="Enter"||e.key===" "){ e.preventDefault(); tog(); } };
    document.addEventListener("click", function(e){ if (e.target.isConnected && !el.contains(e.target)) el.classList.remove("open"); });
    document.addEventListener("keydown", function(e){ if (e.key==="Escape") el.classList.remove("open"); });
    el.querySelector("#xoSignOut").onclick = function(){ if (!user && !guest) { var m = el.querySelector("#xoMsg"); if (m) m.textContent = "You are offline. Sign out needs a connection."; return; } API.signOut(); };
    if (guest) { el.querySelector("#xoCreate").onclick = function(){ location.href = "Login.html?mode=new"; }; return; }

    // ---- editor state ----
    var $ = function(s){ return el.querySelector(s); }, msg = $("#xoMsg");
    var grp = 0, cfg = parseAv(pr.avatar) || AV_DEFAULT.slice(), photo = pr.photo || "", emoji = (!parseAv(pr.avatar) && pr.avatar && pr.avatar !== "photo") ? pr.avatar : "";
    var mode = parseAv(pr.avatar) ? "a" : (pr.avatar === "photo" && photo) ? "p" : emoji ? "e" : "a";
    function say(t){ msg.textContent = t || ""; }
    function preview(){
      var av = mode === "a" ? encAv(cfg) : mode === "p" ? (photo ? "photo" : "") : emoji;
      $("#xoBig").innerHTML = avHTML(av, photo, $("#xoName").value || name);
    }
    function maker(){
      var rows = ROWS.filter(function(r){ return r[4] === grp; }).map(function(r){
        var v = cfg[r[1]];
        if (r[2] === "c") return '<div class="xo-row col"><label>'+r[0]+'</label><div class="xo-sw">'+r[3].map(function(c,i){ return '<button type="button" aria-label="'+r[0]+' '+(i+1)+'" data-r="'+r[1]+'" data-v="'+i+'" class="'+(i===v?"on":"")+'" style="background:'+c+'"></button>'; }).join("")+'</div></div>';
        if (r[3].length > 9) return '<div class="xo-row"><label>'+r[0]+'</label><select class="xo-sel" data-r="'+r[1]+'" aria-label="'+r[0]+'">'+r[3].map(function(n,i){ return '<option value="'+i+'"'+(i===v?" selected":"")+'>'+n+'</option>'; }).join("")+'</select></div>';
        return '<div class="xo-row"><label>'+r[0]+'</label><div class="xo-st"><button type="button" data-r="'+r[1]+'" data-d="-1" aria-label="Previous">&#8249;</button><span>'+r[3][v]+'</span><button type="button" data-r="'+r[1]+'" data-d="1" aria-label="Next">&#8250;</button></div></div>';
      }).join("");
      $("#xoMaker").innerHTML = '<div class="xo-grp">'+GROUPS.map(function(n,i){ return '<button type="button" data-g="'+i+'" class="'+(i===grp?"on":"")+'">'+n+'</button>'; }).join("")+'</div>'+rows;
    }
    function setMode(m){
      mode = m;
      [].forEach.call(el.querySelectorAll(".xo-tabs button"), function(b){ b.classList.toggle("on", b.dataset.m === m); });
      [].forEach.call(el.querySelectorAll(".xo-pane"), function(p){ p.classList.toggle("on", p.dataset.p === m); });
      [].forEach.call(el.querySelectorAll("#xoAvs button"), function(b){ b.classList.toggle("on", b.dataset.a === emoji); });
      say(""); preview();
    }
    $(".xo-tabs").onclick = function(e){ var b = e.target.closest("button"); if (b) setMode(b.dataset.m); };
    $("#xoMaker").onclick = function(e){
      var b = e.target.closest("button"); if (!b) return;
      if (b.dataset.g) { grp = +b.dataset.g; maker(); return; }
      var r = +b.dataset.r, n = slotLens()[r];
      cfg[r] = b.dataset.d ? (cfg[r] + (+b.dataset.d) + n) % n : +b.dataset.v;
      maker(); preview();
    };
    $("#xoMaker").onchange = function(e){
      var s = e.target.closest("select"); if (!s) return;
      cfg[+s.dataset.r] = +s.value; maker(); preview();
    };
    $("#xoDice").onclick = function(){
      var L = slotLens(), pick = function(i){ return Math.floor(Math.random() * L[i]); };
      cfg = L.map(function(n, i){ return pick(i); });
      if (Math.random() < .7) cfg[8] = 0;           // most surprises have no hat
      maker(); preview();
    };
    $("#xoAvs").onclick = function(e){ var b = e.target.closest("button"); if (!b) return; emoji = (emoji === b.dataset.a) ? "" : b.dataset.a; setMode("e"); };
    $("#xoPick").onclick = function(){ $("#xoFile").click(); };
    $("#xoFile").onchange = function(){
      var f = this.files && this.files[0]; this.value = ""; if (!f) return;
      say("Preparing your photo...");
      readPhoto(f, function(d){ if (!d) { say("That file isn't a usable image."); return; } photo = d; say("Looks good. Press Save."); preview(); });
    };
    $("#xoDrop").onclick = function(){ photo = ""; say("Photo removed. Press Save."); preview(); };
    $("#xoName").oninput = function(){ if (mode === "e" ? !emoji : (mode === "p" ? !photo : false)) preview(); };
    $("#xoSave").onclick = function(){
      var n = esc($("#xoName").value).trim().slice(0,14);
      if (n.length < 2) { say("Name needs at least 2 characters."); return; }
      var av = mode === "a" ? encAv(cfg) : mode === "p" ? (photo ? "photo" : "") : emoji;
      var ph = av === "photo" ? photo : null;
      API.setProfile({ name:n, avatar:av, photo:ph }).then(function(){
        $("#xoNm").textContent = n; $("#xoAv").innerHTML = avHTML(av, ph, n); say("Saved.");
      }).catch(function(){ say("Couldn't save. Check your connection."); });
    };
    $("#xoCopy").onclick = function(){
      var t = tag; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function(){ say("ID copied."); }).catch(function(){ say("Your ID is "+t); });
    };
    maker(); setMode(mode);
  }

  // ---- installable app: manifest + service worker (works on https and localhost) ----
  (function(){
    try {
      if (!document.querySelector('link[rel="manifest"]')) {
        var l = document.createElement("link"); l.rel = "manifest"; l.href = "manifest.webmanifest"; document.head.appendChild(l);
        var m = document.createElement("meta"); m.name = "theme-color"; m.content = "#05060a"; document.head.appendChild(m);
        var a = document.createElement("link"); a.rel = "apple-touch-icon"; a.href = "apple-touch-icon.png"; document.head.appendChild(a);
      }
      if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
        window.addEventListener("load", function(){ navigator.serviceWorker.register("sw.js").catch(function(){}); });
      }
    } catch(e){}
  })();

  // ---- "VS" intro: XOAuth.vs({ me, opp, sub, mode }) -> Promise (tap to skip) ----
  // me / opp: { name, av (avatar code or emoji), photo, tag }.  mode "xo" shows big X vs O instead of avatars.
  var BOTS = [
    { n:"Rookie", av:"a:6110008600000" },
    { n:"Greedy", av:"a:1k47005500003" },
    { n:"Cautious", av:"a:2p00508700004" },
    { n:"Balanced", av:"a:3221301300001" },
    { n:"Hunter", av:"a:0d45001100003" },
    { n:"The Wall", av:"a:400122a600001" },
    { n:"Tactician", av:"a:2e01107200002" },
    { n:"Strategist", av:"a:1i51547800002" },
    { n:"Predator", av:"a:3j0521a900002" },
    { n:"Relentless", av:"a:3h0121a950702" } ];
  var VS_CSS = [
    "#xoVS{position:fixed;inset:0;z-index:100000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;overflow:hidden;font-family:'Segoe UI',system-ui,sans-serif;color:#fff;background:radial-gradient(circle at 50% 50%,#150a2e 0%,#05060a 70%);animation:vsIn .35s ease-out both;cursor:pointer;-webkit-tap-highlight-color:transparent}",
    "#xoVS.out{animation:vsOut .45s ease-in both}",
    "@keyframes vsIn{from{opacity:0}to{opacity:1}}@keyframes vsOut{to{opacity:0;transform:scale(1.06)}}",
    "#xoVS .vs-bar{position:absolute;left:-10%;right:-10%;height:42%;opacity:.9}",
    "#xoVS .vs-bar.a{top:0;background:linear-gradient(110deg,rgba(255,47,109,.35),rgba(255,47,109,0) 60%);transform:skewY(-6deg) translateY(-30%);animation:vsBarA .7s .1s cubic-bezier(.2,.9,.3,1) both}",
    "#xoVS .vs-bar.b{bottom:0;background:linear-gradient(290deg,rgba(18,200,217,.35),rgba(18,200,217,0) 60%);transform:skewY(-6deg) translateY(30%);animation:vsBarB .7s .1s cubic-bezier(.2,.9,.3,1) both}",
    "@keyframes vsBarA{from{transform:skewY(-6deg) translateY(-130%)}to{transform:skewY(-6deg) translateY(-30%)}}@keyframes vsBarB{from{transform:skewY(-6deg) translateY(130%)}to{transform:skewY(-6deg) translateY(30%)}}",
    "#xoVS .vs-sub{position:relative;z-index:2;margin-bottom:22px;font-size:11px;font-weight:800;letter-spacing:5px;opacity:0;text-transform:uppercase;color:rgba(255,255,255,.6);animation:vsFade .5s .2s both}",
    "#xoVS .vs-row{position:relative;z-index:2;display:flex;align-items:center;justify-content:center;gap:clamp(10px,4vw,30px);width:100%}",
    "#xoVS .vs-p{display:flex;flex-direction:column;align-items:center;gap:12px;width:clamp(100px,32vw,150px);min-width:0}",
    "#xoVS .vs-p.l{animation:vsL .7s .15s cubic-bezier(.2,.9,.3,1) both}#xoVS .vs-p.r{animation:vsR .7s .15s cubic-bezier(.2,.9,.3,1) both}",
    "@keyframes vsL{from{opacity:0;transform:translateX(-120%)}to{opacity:1;transform:none}}@keyframes vsR{from{opacity:0;transform:translateX(120%)}to{opacity:1;transform:none}}",
    "#xoVS .vs-av{width:clamp(92px,30vw,136px);aspect-ratio:1;border-radius:50%;overflow:hidden;display:grid;place-items:center;font-size:clamp(2.6rem,10vw,3.8rem);font-weight:900;background:linear-gradient(135deg,#7c3aed,#12c8d9);box-shadow:0 0 0 4px var(--c),0 0 40px var(--c),0 14px 30px rgba(0,0,0,.5)}",
    "#xoVS .vs-av svg,#xoVS .vs-av img{width:100%;height:100%;display:block;object-fit:cover}",
    "#xoVS .vs-xo{background:rgba(255,255,255,.04);box-shadow:0 0 0 4px var(--c),0 0 40px var(--c);font-family:'Arial Black',sans-serif;color:var(--c);text-shadow:0 0 24px var(--c)}",
    "#xoVS .vs-n{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:900;font-size:clamp(.95rem,4vw,1.3rem);letter-spacing:.5px}",
    "#xoVS .vs-t{font-size:11px;letter-spacing:2px;font-weight:700;opacity:.55;text-transform:uppercase;margin-top:-6px}",
    "#xoVS .vs-vs{font-family:'Arial Black',sans-serif;font-size:clamp(2rem,9vw,3.2rem);font-style:italic;color:#fff;text-shadow:0 0 24px #bc13fe,0 0 50px #bc13fe;animation:vsPop .55s .55s cubic-bezier(.2,1.6,.4,1) both}",
    "@keyframes vsPop{from{opacity:0;transform:scale(3) rotate(-14deg)}to{opacity:1;transform:none}}",
    "#xoVS .vs-hint{position:absolute;bottom:26px;z-index:2;font-size:10px;letter-spacing:3px;opacity:0;color:#fff;animation:vsFade .6s 1.2s both}",
    "@keyframes vsFade{to{opacity:.4}}",
    "@media(prefers-reduced-motion:reduce){#xoVS *{animation-duration:.01s!important;animation-delay:0s!important}}"
  ].join("\n");
  function vsPlayer(p, side, c, xo){
    var av = xo ? '<div class="vs-av vs-xo">'+esc(xo)+'</div>' : '<div class="vs-av">'+avHTML(p.av, p.photo, p.name)+'</div>';
    return '<div class="vs-p '+side+'" style="--c:'+c+'">'+av+'<div class="vs-n">'+esc(p.name || "Player")+'</div>'+(p.tag ? '<div class="vs-t">'+esc(p.tag)+'</div>' : '')+'</div>';
  }
  API.myCard = function(){
    var pr = {}; try { pr = JSON.parse(g("xo_profile")||"{}"); } catch(e){}
    var guest = !g("xo_hint") || g("xo_hint") === "guest";
    return { name: guest ? "You" : (pr.name || "You"), av: guest ? "" : pr.avatar, photo: guest ? "" : pr.photo, tag: guest || !pr.tag ? "" : "#"+pr.tag };
  };
  API.botCard = function(i){ var b = BOTS[Math.max(0, Math.min(BOTS.length - 1, i|0))]; return { name:b.n, av:b.av, tag:"AI" }; };
  API.vs = function(o){
    o = o || {};
    return new Promise(function(res){
      var old = document.getElementById("xoVS"); if (old) old.remove();
      if (!document.getElementById("xoVSCss")) { var s = document.createElement("style"); s.id = "xoVSCss"; s.textContent = VS_CSS; document.head.appendChild(s); }
      var el = document.createElement("div"); el.id = "xoVS";
      var xo = o.mode === "xo";
      el.innerHTML = '<div class="vs-bar a"></div><div class="vs-bar b"></div>'+
        (o.sub ? '<div class="vs-sub">'+esc(o.sub)+'</div>' : '')+
        '<div class="vs-row">'+vsPlayer(o.me || API.myCard(), "l", "#ff2f6d", xo ? "X" : "")+'<div class="vs-vs">VS</div>'+vsPlayer(o.opp || { name:"Opponent" }, "r", "#12c8d9", xo ? "O" : "")+'</div>'+
        '<div class="vs-hint">TAP TO SKIP</div>';
      document.body.appendChild(el);
      var done = false;
      function end(){ if (done) return; done = true; el.classList.add("out"); setTimeout(function(){ el.remove(); res(); }, 420); }
      el.addEventListener("click", end);
      setTimeout(end, o.ms || 2600);
    });
  };
})();
