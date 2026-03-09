'use strict';

// ═══════════════════════════════════════════════════════════
//  FIREBASE CONFIGURATION
// ═══════════════════════════════════════════════════════════
var FIREBASE_CONFIG = {
  apiKey:            "AIzaSyBUIvrsi6ye7iUXYod2Hw386rEZghWUJJo",
  authDomain:        "mygame-68feb.firebaseapp.com",
  projectId:         "mygame-68feb",
  storageBucket:     "mygame-68feb.firebasestorage.app",
  messagingSenderId: "967293890321",
  appId:             "1:967293890321:web:09dc8b72ac3dd997d626b0"
};



var fbApp = null, fbAuth = null, fbDb = null, firebaseReady = false;
(function initFirebase() {
  try {
    if (FIREBASE_CONFIG.apiKey === 'YOUR_API_KEY') return;
    fbApp  = firebase.initializeApp(FIREBASE_CONFIG);
    fbAuth = firebase.auth();
    fbDb   = firebase.firestore();
    firebaseReady = true;

    fbAuth.onAuthStateChanged(function(user) {
      if (user) onFirebaseSignIn(user);
      else onFirebaseSignOut();
    });
  } catch(e) { console.warn('Firebase init failed:', e); }
})();

// ═══════════════════════════════════════════════════════════
//  ACCOUNT STATE
// ═══════════════════════════════════════════════════════════
var accountInfo = null;
var ACCOUNT_KEY = 'vt_account';

function getSaveKey() { return accountInfo ? 'voidtactics_v7_' + accountInfo.uid : 'voidtactics_v7'; }
var LOCAL_SAVE_KEY = 'voidtactics_v7'; 

function signInWithGoogle() {
  if (!firebaseReady) { showFirebaseNotice(); return; }
  var provider = new firebase.auth.GoogleAuthProvider();
  showAuthLoading(true);
  fbAuth.signInWithPopup(provider).then(function() { showAuthLoading(false); }).catch(function(e) { showAuthLoading(false); showToast('❌ Googleログイン失敗'); });
}


function onFirebaseSignIn(firebaseUser) {
  var providerData = firebaseUser.providerData[0];
  var provider = providerData ? providerData.providerId.replace('.com','') : 'unknown';
  accountInfo = { uid: firebaseUser.uid, name: firebaseUser.displayName || 'Agent', email: firebaseUser.email || '', photoURL: firebaseUser.photoURL, provider: provider };
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(accountInfo));
  onAccountSignIn(accountInfo);
}

function onFirebaseSignOut() {
  accountInfo = null; localStorage.removeItem(ACCOUNT_KEY); updateAccountUI();
}

function onAccountSignIn(info) {
  updateAccountUI();

  var sb = document.getElementById('sync-badge');
  if (sb) { sb.className = firebaseReady ? 'account-sync-badge sync-cloud' : 'account-sync-badge sync-local'; sb.textContent = firebaseReady ? '☁ CLOUD' : '💾 LOCAL'; }
  var migBanner = document.getElementById('migrate-banner');
  if (migBanner) migBanner.style.display = 'none';

  if (firebaseReady && fbDb) {
    // クラウドを最初に確認し、新しい方を採用する
    cloudLoad(function(cloudData) {
      var localTs = 0;
      var hasAccountSave = !!localStorage.getItem(getSaveKey());
      if (hasAccountSave) {
        try {
          var localRaw = localStorage.getItem(getSaveKey());
          var localParsed = JSON.parse(localRaw);
          localTs = (localParsed && localParsed.gameData && localParsed.gameData._savedAt) || 0;
        } catch(e) {}
      }

      if (cloudData && (cloudData._savedAt || 0) >= localTs) {
        // クラウドが新しい or 同等 → クラウドを採用
        gameData = cloudData;
        if (!gameData.inventory) gameData.inventory = [];
        if (!gameData.roster)    gameData.roster = {};
        if (!gameData.stats)     gameData.stats = {kills:0,totalCoins:0,clears:{}};
        // ローカルに保存してからselectedCharIdも復元
        try {
          var localRaw2 = localStorage.getItem(getSaveKey());
          var localParsed2 = localRaw2 ? JSON.parse(localRaw2) : null;
          if (localParsed2 && localParsed2.selectedCharId) selectedCharId = localParsed2.selectedCharId;
        } catch(e) {}
        localStorage.setItem(getSaveKey(), JSON.stringify({gameData:gameData, selectedCharId:selectedCharId}));
        if ((cloudData._savedAt || 0) > localTs) showToast('☁ クラウドデータを復元しました');
      } else if (hasAccountSave) {
        // ローカルが新しい → ローカルを読んでクラウドに同期
        loadSave();
        cloudSave();
      } else {
        // どちらもない → 新規
      }

      // selectedCharId に対応する curCharData をセット
      if (selectedCharId) {
        selectedCharDef = CHARACTER_DEFS.find(function(c) { return c.id === selectedCharId; });
        if (selectedCharDef && gameData.roster && gameData.roster[selectedCharId]) {
          curCharData = gameData.roster[selectedCharId];
          if (!curCharData.charStats) curCharData.charStats = {kills:0,totalCoins:0,maxCombo:0,challengeClears:0};
          if (!curCharData.unlockedAchieves) curCharData.unlockedAchieves = [];
          recalcStats();
        }
      }
      checkSaveOnStart();
    });
  } else {
    // Firebase未使用 → ローカルのみ
    var hasAccountSave = !!localStorage.getItem(getSaveKey());
    var hasLocalSave   = !!localStorage.getItem(LOCAL_SAVE_KEY) && LOCAL_SAVE_KEY !== getSaveKey();
    if (hasAccountSave) { loadSave(); }
    else if (hasLocalSave) { loadSaveFromKey(LOCAL_SAVE_KEY); }
    checkSaveOnStart();
  }
}

function migrateLocalToCloud() {
  var localData = localStorage.getItem(LOCAL_SAVE_KEY);
  if (!localData) { showToast('移行するデータが見つかりません'); return; }
  localStorage.setItem(getSaveKey(), localData);
  localStorage.removeItem(LOCAL_SAVE_KEY);
  loadSave(); checkSaveOnStart();
  document.getElementById('migrate-banner').style.display = 'none';
  cloudSave(); showToast('✅ データをアカウントに移行しました！');
}

function dismissMigrate() { document.getElementById('migrate-banner').style.display = 'none'; }

function signOutAccount() {
  showConfirm('🚪','ログアウトしますか？','ログアウト後もローカルデータは保持されます。\n再ログインでデータを復元できます。','#667',function(){
    if (firebaseReady && fbAuth) fbAuth.signOut().catch(function(){});
    else { accountInfo = null; localStorage.removeItem(ACCOUNT_KEY); updateAccountUI(); }
    showToast('👋 ログアウトしました');
  });
}

function updateAccountUI() {
  var guestUI = document.getElementById('account-guest-ui'), loggedinUI = document.getElementById('account-loggedin-ui');
  if (!guestUI || !loggedinUI) return;
  if (accountInfo) {
    guestUI.style.display = 'none'; loggedinUI.style.display = 'block';
    document.getElementById('account-name-txt').textContent = accountInfo.name;
    document.getElementById('account-sub-txt').textContent = accountInfo.email || '';
    var avatarWrap = document.getElementById('account-avatar-wrap');
    if (accountInfo.photoURL) avatarWrap.innerHTML = '<img class="account-avatar" src="' + accountInfo.photoURL + '" onerror="this.style.display=\'none\'">';
    else avatarWrap.innerHTML = '<div class="account-avatar-placeholder">👤</div>';
  } else {
    guestUI.style.display = 'block'; loggedinUI.style.display = 'none';
    document.getElementById('migrate-banner').style.display = 'none';
  }
}

function showAuthLoading(on) { var el = document.getElementById('auth-loading'); if (el) el.style.display = on ? 'block' : 'none'; }
function showFirebaseNotice() { var el = document.getElementById('firebase-notice'); if (el) { el.style.display = 'block'; el.textContent = '⚠ Firebase設定が必要です'; } }

function cloudSave() {
  if (!firebaseReady || !fbDb || !accountInfo) return;
  try {
    var data = JSON.parse(JSON.stringify(gameData));
    data._savedAt = Date.now();
    fbDb.collection('saves').doc(accountInfo.uid).set(data).catch(function(e){ console.warn('Firestore save error:', e); });
  } catch(e) {}
}

function cloudLoad(callback) {
  if (!firebaseReady || !fbDb || !accountInfo) { callback(null); return; }
  fbDb.collection('saves').doc(accountInfo.uid).get().then(function(doc) {
    if (doc.exists) callback(doc.data()); else callback(null);
  }).catch(function() { callback(null); });
}

// ═══════════════════════ GAME DATA ═══════════════════════
var gameData={coin:0,core:0,dust:0,level:1,roster:{},stats:{kills:0,totalCoins:0,clears:{}}};
var selectedCharId=null,selectedCharDef=null,curCharData=null;
var eData={},bState={player:{buffs:[]},enemy:{buffs:[]}};
var isPlayerTurn=false,pAnim=null,eAnim=null,battleLocked=false;
var comboCount=0,isChallenge=false,currentBattleStage=1;
var ultUsedThisBattle = false;

var CHARACTER_DEFS=[
  {id:'luna',name:'ルナ',title:'MAGE GIRL',sprite:LUNA,color:'#cc66ff',baseHp:80,baseEp:80,baseAtk:18,baseDef:4, desc:'高火力魔法少女。星の力を操る',statD:{hp:'★★☆',ep:'★★★★★',atk:'★★★★★'}, skills:['attack','magic_burst','mana_shield','starfall','ultimate_luna'], cutscene:{bgColor:'#220044',textColor:'#cc66ff',subtitle:'STARLIGHT BREAKER',lines:['星が...','輝く...','全てを...','砕け！！']}},
  {id:'gant',name:'ガント',title:'WARRIOR BOY',sprite:GANT,color:'#4488ee',baseHp:120,baseEp:45,baseAtk:14,baseDef:8, desc:'バランス型の剣士。勇敢な魂',statD:{hp:'★★★★',ep:'★★☆',atk:'★★★★'}, skills:['attack','heavy','rally','heal_minor','ultimate_gant'], cutscene:{bgColor:'#001133',textColor:'#4488ee',subtitle:'BRAVE SLASH',lines:['剣に...','誓う！','勇者の...','一撃！！']}},
  {id:'fors',name:'フォルス',title:'IRON KNIGHT',sprite:FORS,color:'#aabbcc',baseHp:150,baseEp:30,baseAtk:11,baseDef:14, desc:'鉄壁の重装甲騎士。盾の守護者',statD:{hp:'★★★★★',ep:'★☆☆',atk:'★★★'}, skills:['attack','shield_bash','defend','iron_wall','ultimate_fors'], cutscene:{bgColor:'#001122',textColor:'#aabbcc',subtitle:'AEGIS GUARD',lines:['盾が...','世界を...','守る...','不落！！']}},
  {id:'shadow',name:'シャドウ',title:'DARK WITCH',sprite:SHADOW,color:'#00ffaa',baseHp:90,baseEp:75,baseAtk:16,baseDef:5, desc:'毒を操る謎の魔女。闇の化身',statD:{hp:'★★☆',ep:'★★★★',atk:'★★★★'}, skills:['attack','curse','poison','soul_drain','ultimate_shadow'], cutscene:{bgColor:'#001a0d',textColor:'#00ffaa',subtitle:'ABYSS GATE',lines:['深淵が...','開く...','呪われよ...','滅べ！！']}},
];

var SKILLS={
  attack:       {name:'通常攻撃',   ep:0,  desc:'基本攻撃。コンボを積む', action:function(a,d,bs){dealDmg(a,d,1.0,bs);addCombo();}},
  heavy:        {name:'スマッシュ', ep:15, desc:'強力な一撃。高ダメージ',  action:function(a,d,bs){dealDmg(a,d,1.9,bs);}},
  magic_burst:  {name:'マジックバースト',ep:20,desc:'魔法爆発。×2ダメ', action:function(a,d,bs){dealDmg(a,d,2.1,bs);}},
  shield_bash:  {name:'シールドバッシュ',ep:10,desc:'攻撃+ATKダウン',   action:function(a,d,bs){dealDmg(a,d,1.3,bs);applyBuff(d,bs,'atk_down',2,'ATKダウン');}},
  defend:       {name:'ガード体制', ep:12, desc:'防御バフ3ターン',       action:function(a,d,bs){applyBuff(a,bState.player,'def_up',3,'防御UP');}},
  poison:       {name:'アシッドボム',ep:20,desc:'毒付与3ターン',         action:function(a,d,bs){applyBuff(d,bs,'poison',3,'毒');}},
  curse:        {name:'ダークカース',ep:22,desc:'毒+ATKダウン',          action:function(a,d,bs){applyBuff(d,bs,'poison',3,'毒');applyBuff(d,bs,'atk_down',3,'ATKダウン');}},
  mana_shield:  {name:'マナシールド',ep:18,desc:'防御+EP回収+15',        action:function(a,d,bs){applyBuff(a,bState.player,'def_up',3,'防御UP');curCharData.ep=Math.min(curCharData.maxEp,curCharData.ep+15);logMsg('EP +15 回収！','var(--cyan)');}},
  heal_minor:   {name:'応急キット', ep:15, desc:'HP 28%回復',           action:function(a,d,bs){healHP(a,.28);}},
  starfall:     {name:'スターフォール',ep:28,desc:'連続3ヒット',         action:function(a,d,bs){for(var i=0;i<3;i++){setTimeout((function(ii){return function(){if(eData.cur&&eData.cur.hp>0)dealDmg(a,d,0.65,bs);};})(i),i*180);addCombo();}}},
  rally:        {name:'ラリーコール',ep:20,desc:'ATK+コンボ+3',          action:function(a,d,bs){applyBuff(a,bState.player,'atk_up',3,'ATKアップ');comboCount=Math.min(9,comboCount+3);updateComboUI();}},
  iron_wall:    {name:'アイアンウォール',ep:22,desc:'超防御+HP回復小',   action:function(a,d,bs){applyBuff(a,bState.player,'def_up',4,'超防御UP');healHP(a,.15);}},
  soul_drain:   {name:'ソウルドレイン',ep:25,desc:'攻撃+自分HP回復',    action:function(a,d,bs){var dmg=dealDmg(a,d,1.4,bs);if(typeof dmg==='number'){var heal=Math.floor(dmg*.5);a.hp=Math.min(a.maxHp,a.hp+heal);logMsg('HP +'+heal+' ドレイン！','var(--green)');}  }},
  ultimate_luna:  {name:'スターライトブレイカー',ep:40,isUlt:true,action:function(a,d,bs){dealDmg(a,d,3.6,bs);}},
  ultimate_gant:  {name:'ブレイブスラッシュ',    ep:30,isUlt:true,action:function(a,d,bs){dealDmg(a,d,2.6,bs);applyBuff(a,bState.player,'def_up',2,'防御UP');}},
  ultimate_fors:  {name:'イージスガード',        ep:25,isUlt:true,action:function(a,d,bs){healHP(a,.65);applyBuff(a,bState.player,'def_up',4,'超防御UP');}},
  ultimate_shadow:{name:'アビスゲート',          ep:35,isUlt:true,action:function(a,d,bs){dealDmg(a,d,2.3,bs);applyBuff(d,bs,'poison',5,'猛毒');}},
};

var ZONES=[
  {id:'grass',name:'GRASSLAND',emoji:'🌿',color:'#22aa44', enemies:[{name:'ゴブリン',sprite:GOBLIN,baseHp:55,baseAtk:8},{name:'フォレストトロール',sprite:FOREST_TROLL,baseHp:80,baseAtk:11}], boss:{name:'フォレストタイタン',sprite:GRASS_BOSS,baseHp:220,baseAtk:16}},
  {id:'desert',name:'DESERT',emoji:'🏜',color:'#cc8833', enemies:[{name:'サンドスコーピオン',sprite:SCORPION,baseHp:65,baseAtk:10},{name:'ミイラ兵',sprite:MUMMY,baseHp:90,baseAtk:13}], boss:{name:'デザートファラオ',sprite:DESERT_BOSS,baseHp:260,baseAtk:19}},
  {id:'void',name:'VOID SECTOR',emoji:'🌀',color:'#cc66ff', enemies:[{name:'ヴォイドクリーパー',sprite:VOID_CREEPER,baseHp:75,baseAtk:12},{name:'シャドウスペクター',sprite:SHADOW_SPECTER,baseHp:95,baseAtk:15}], boss:{name:'ヴォイドオーバーロード',sprite:VOID_BOSS,baseHp:300,baseAtk:22}},
  {id:'ice',name:'ICE TUNDRA',emoji:'❄',color:'#88ddff', enemies:[{name:'アイスウルフ',sprite:ICE_WOLF,baseHp:80,baseAtk:13},{name:'フロストジャイアント',sprite:FROST_GIANT,baseHp:110,baseAtk:16}], boss:{name:'フロストドラゴン',sprite:ICE_BOSS,baseHp:340,baseAtk:24}},
  {id:'magma',name:'MAGMA CORE',emoji:'🔥',color:'#ff5511', enemies:[{name:'ラバゴーレム',sprite:LAVA_GOLEM,baseHp:95,baseAtk:15},{name:'ファイアデーモン',sprite:FIRE_DEMON,baseHp:115,baseAtk:18}], boss:{name:'インフェルノソブリン',sprite:MAGMA_BOSS,baseHp:380,baseAtk:27}},
];

function getStageInfo(stage){var z=Math.floor((stage-1)/5)%ZONES.length,n=(stage-1)%5,isBoss=n===4;return{zone:ZONES[z],isBoss:isBoss,zoneIdx:z,inZone:n};}
function getEnemyForStage(stage,challenge){
  var info=getStageInfo(stage),z=info.zone,sc=Math.floor((stage-1)/5),hm=1+sc*0.32,am=1+sc*0.26,cm=challenge?1.5:1.0;
  if(info.isBoss)return{name:z.boss.name,sprite:z.boss.sprite,isBoss:true,maxHp:Math.floor(z.boss.baseHp*hm*cm+(stage-1)*18),atk:Math.floor(z.boss.baseAtk*am*cm+(stage-1)*2.5)};
  var pick=z.enemies[Math.floor(Math.random()*z.enemies.length)];
  return{name:pick.name,sprite:pick.sprite,isBoss:false,maxHp:Math.floor(pick.baseHp*hm*cm+(stage-1)*14),atk:Math.floor(pick.baseAtk*am*cm+(stage-1)*2)};
}

var ITEM_POOL=[
  {id:'wood_sword',name:'木の剣',slot:'weapon',icon:'🗡',rarity:'common',stats:{atk:3}},
  {id:'iron_sword',name:'アイアンソード',slot:'weapon',icon:'⚔', rarity:'rare',stats:{atk:7}},
  {id:'magic_rod',name:'魔法のロッド',slot:'weapon',icon:'🪄',rarity:'rare',stats:{atk:5,ep:10}},
  {id:'void_blade',name:'ヴォイドブレード',slot:'weapon',icon:'🌀',rarity:'epic',stats:{atk:12,def:3}},
  {id:'star_lance',name:'スターランス',slot:'weapon',icon:'✨',rarity:'legend',stats:{atk:18,ep:15}},
  {id:'fire_axe',name:'炎の斧',slot:'weapon',icon:'🪓',rarity:'epic',stats:{atk:14}},
  {id:'frost_bow',name:'氷結の弓',slot:'weapon',icon:'🏹',rarity:'rare',stats:{atk:8,def:2}},
  {id:'luna_wand',name:'月輝の魔杖',slot:'weapon',icon:'🌙',rarity:'epic',stats:{atk:10,ep:20},charOnly:'luna'},
  {id:'luna_staff',name:'スターロッド',slot:'weapon',icon:'⭐',rarity:'legend',stats:{atk:15,ep:30},charOnly:'luna'},
  {id:'gant_blade',name:'勇者の大剣',slot:'weapon',icon:'🗡',rarity:'epic',stats:{atk:16,hp:20},charOnly:'gant'},
  {id:'gant_blade2',name:'ブレイブエッジ',slot:'weapon',icon:'⚔',rarity:'legend',stats:{atk:22,hp:30,def:4},charOnly:'gant'},
  {id:'fors_shield',name:'イージスの盾',slot:'weapon',icon:'🛡',rarity:'epic',stats:{def:14,hp:25},charOnly:'fors'},
  {id:'fors_lance',name:'聖銀の槍',slot:'weapon',icon:'⚡',rarity:'legend',stats:{def:18,hp:40,atk:8},charOnly:'fors'},
  {id:'shadow_dagger',name:'毒牙のダガー',slot:'weapon',icon:'🗡',rarity:'epic',stats:{atk:11,ep:15},charOnly:'shadow'},
  {id:'shadow_tome',name:'禁断の魔導書',slot:'weapon',icon:'📖',rarity:'legend',stats:{atk:14,ep:28},charOnly:'shadow'},
  {id:'cloth',name:'布の鎧',slot:'armor',icon:'👘',rarity:'common',stats:{hp:20,def:2}},
  {id:'iron_armor',name:'アイアンアーマー',slot:'armor',icon:'🛡',rarity:'rare',stats:{hp:40,def:6}},
  {id:'rune_vest',name:'ルーンベスト',slot:'armor',icon:'🧥',rarity:'rare',stats:{hp:30,ep:15}},
  {id:'void_plate',name:'ヴォイドプレート',slot:'armor',icon:'🔵',rarity:'epic',stats:{hp:60,def:10}},
  {id:'dragon_mail',name:'ドラゴンメイル',slot:'armor',icon:'🐉',rarity:'legend',stats:{hp:80,def:14,atk:5}},
  {id:'shadow_cloak',name:'シャドウクローク',slot:'armor',icon:'🌑',rarity:'epic',stats:{hp:45,def:8,ep:20}},
  {id:'luna_robe',name:'星月の法衣',slot:'armor',icon:'💜',rarity:'epic',stats:{hp:35,ep:25,def:4},charOnly:'luna'},
  {id:'gant_armor',name:'ライオンアーマー',slot:'armor',icon:'🦁',rarity:'epic',stats:{hp:55,def:10,atk:4},charOnly:'gant'},
  {id:'fors_plate',name:'鋼鉄の要塞鎧',slot:'armor',icon:'⚙',rarity:'epic',stats:{hp:70,def:16},charOnly:'fors'},
  {id:'shadow_suit',name:'夜影の忍装束',slot:'armor',icon:'🖤',rarity:'epic',stats:{hp:40,ep:20,def:6},charOnly:'shadow'},
  {id:'ring',name:'銀の指輪',slot:'acc',icon:'💍',rarity:'common',stats:{ep:15}},
  {id:'amulet',name:'魔法のアミュレット',slot:'acc',icon:'🔮',rarity:'rare',stats:{ep:20,hp:15}},
  {id:'void_core_acc',name:'ヴォイドコア',slot:'acc',icon:'💎',rarity:'epic',stats:{atk:5,ep:25,hp:20}},
  {id:'star_gem',name:'スタージェム',slot:'acc',icon:'⭐',rarity:'legend',stats:{atk:8,ep:30,hp:30,def:5}},
  {id:'poison_vial',name:'毒薬瓶',slot:'acc',icon:'⚗',rarity:'rare',stats:{ep:15,atk:4}},
  {id:'lava_stone',name:'溶岩石',slot:'acc',icon:'🪨',rarity:'rare',stats:{hp:25,atk:4}},
  {id:'luna_brooch',name:'星降るブローチ',slot:'acc',icon:'🌟',rarity:'epic',stats:{ep:30,atk:6},charOnly:'luna'},
  {id:'gant_ring',name:'勇者の誓指輪',slot:'acc',icon:'💛',rarity:'epic',stats:{atk:9,hp:25},charOnly:'gant'},
  {id:'fors_seal',name:'鉄壁の紋章',slot:'acc',icon:'🔷',rarity:'epic',stats:{def:12,hp:30},charOnly:'fors'},
  {id:'shadow_mask',name:'闇の仮面',slot:'acc',icon:'🎭',rarity:'epic',stats:{ep:22,atk:7,def:3},charOnly:'shadow'},
];

var RARITY_WEIGHTS={common:50,rare:30,epic:15,legend:5};
var RARITY_COLOR={common:'#aaa',rare:'#4499ff',epic:'#cc66ff',legend:'#ffd84d'};
var RARITY_DUST={common:1,rare:2,epic:4,legend:10};

function rollItem(minRarity,charId){
  var pool=ITEM_POOL.filter(function(i){return !i.charOnly||i.charOnly===(charId||selectedCharId);});
  if(minRarity==='rare')pool=pool.filter(function(i){return i.rarity!=='common';});
  var total=pool.reduce(function(sum,i){var w=RARITY_WEIGHTS[i.rarity];return sum+(i.charOnly?w*1.4:w);},0);
  var r=Math.random()*total;var acc=0;
  for(var i=0;i<pool.length;i++){acc+=i.charOnly?RARITY_WEIGHTS[pool[i].rarity]*1.4:RARITY_WEIGHTS[pool[i].rarity];if(r<acc)return JSON.parse(JSON.stringify(pool[i]));}
  return JSON.parse(JSON.stringify(pool[0]));
}
function itemStatString(item){return Object.keys(item.stats).map(function(k){return k.toUpperCase()+'+'+item.stats[k];}).join(' ');}
function getSharedInventory(){if(!gameData.inventory)gameData.inventory=[];return gameData.inventory;}
function getEquipBonus(){
  var bonus={atk:0,hp:0,ep:0,def:0};
  if(!curCharData||!curCharData.equipped)return bonus;
  var inv=getSharedInventory();
  ['weapon','armor','acc'].forEach(function(slot){
    var uid=curCharData.equipped[slot];if(!uid)return;
    var item=inv.find(function(i){return i._uid===uid;});
    if(!item)return;
    Object.keys(item.stats).forEach(function(k){bonus[k]=(bonus[k]||0)+item.stats[k];});
  });
  return bonus;
}
function getItemEquippedByOther(uid){
  var others=null;
  Object.keys(gameData.roster).forEach(function(cid){
    if(cid===selectedCharId)return;
    var r=gameData.roster[cid];if(!r.equipped)return;
    if(Object.values(r.equipped).indexOf(uid)>=0)others=cid;
  });
  return others;
}
function addToInventory(item){ var inv=getSharedInventory(); item._uid=Date.now()+'_'+Math.floor(Math.random()*10000); inv.push(item); }
function equipItem(uid){
  var inv=getSharedInventory();
  var item=inv.find(function(i){return i._uid===uid;});if(!item)return;
  if(item.charOnly&&item.charOnly!==selectedCharId){var ownerDef=CHARACTER_DEFS.find(function(c){return c.id===item.charOnly;});showToast('⚠ '+item.name+' は '+(ownerDef?ownerDef.name:'他キャラ')+'専用装備です');return;}
  var otherCid=getItemEquippedByOther(uid);
  if(otherCid){var otherDef=CHARACTER_DEFS.find(function(c){return c.id===otherCid;});showToast('⚠ '+(otherDef?otherDef.name:'他キャラ')+'が装備中です。先に外してください');return;}
  if(!curCharData.equipped)curCharData.equipped={weapon:null,armor:null,acc:null};
  curCharData.equipped[item.slot]=uid;
  recalcStats();saveGame();renderEquipTab();renderHubStatus();
  showToast('🗡 '+item.name+' を装備した！');
}
function unequipSlot(slot){
  if(!curCharData.equipped)return; curCharData.equipped[slot]=null;
  recalcStats();saveGame();renderEquipTab();renderHubStatus();
}
function disassembleItem(uid){
  var inv=getSharedInventory(); var item=inv.find(function(i){return i._uid===uid;});if(!item)return;
  if(curCharData.equipped&&Object.values(curCharData.equipped).indexOf(uid)>=0){showToast('装備中は分解できません');return;}
  var otherCid=getItemEquippedByOther(uid);
  if(otherCid){var otherDef=CHARACTER_DEFS.find(function(c){return c.id===otherCid;});showToast('⚠ '+(otherDef?otherDef.name:'他キャラ')+'が装備中のため分解できません');return;}
  var dust=RARITY_DUST[item.rarity]||1; var rarityNames={common:'コモン',rare:'レア',epic:'エピック',legend:'レジェンド'};
  showConfirm('⚠','装備を分解しますか？','【'+item.icon+' '+item.name+'】\n'+(item.charOnly?'★キャラ専用 ':'')+'['+rarityNames[item.rarity]+']\n'+itemStatString(item)+'\n\n分解すると🔮ダスト×'+dust+'になります。\nこの操作は元に戻せません！','var(--magenta)',function(){
    var idx=inv.findIndex(function(i){return i._uid===uid;}); if(idx<0)return;
    inv.splice(idx,1);gameData.dust+=dust;saveGame();renderEquipTab();updateHubHeader(); showToast('🔮 '+item.name+' → ダスト×'+dust);
  });
}
function forgeItem(){
  var cost=3;if(gameData.dust<cost){showToast('🔮 ダストが不足しています');return;}
  var inv=getSharedInventory();if(inv.length>=40){showToast('倉庫がいっぱいです(最大40)');return;}
  gameData.dust-=cost;var item=rollItem('rare');addToInventory(item);saveGame();updateHubHeader();renderEquipTab();
  showDropPopup(item,function(){});
}

function showConfirm(icon,title,body,accentColor,onOk,okLabel){
  var overlay=document.createElement('div');overlay.className='confirm-overlay';
  var color=accentColor||'var(--magenta)';var label=okLabel||'実行する';
  overlay.innerHTML='<div class="confirm-box" style="border-color:'+color+'"><div class="confirm-icon">'+icon+'</div><div class="confirm-title" style="color:'+color+'">'+title+'</div><div class="confirm-body" style="white-space:pre-line;">'+body+'</div><div class="confirm-btns"><button class="btn" style="border-color:'+color+';color:'+color+';" id="conf-ok">'+label+'</button><button class="btn back" id="conf-cancel">キャンセル</button></div></div>';
  document.body.appendChild(overlay);
  document.getElementById('conf-ok').addEventListener('click',function(){overlay.remove();onOk();});
  document.getElementById('conf-cancel').addEventListener('click',function(){overlay.remove();});
}

function getSkillLevel(sid){return(curCharData.skillLevels&&curCharData.skillLevels[sid])||0;}
function getSkillMult(sid){return 1+getSkillLevel(sid)*0.15;}
function getSkillUpgradeCost(sid){return 60+(getSkillLevel(sid)*35);}
function upgradeSkill(sid){
  var lv=getSkillLevel(sid);if(lv>=5){showToast('最大レベルです');return;}
  var cost=getSkillUpgradeCost(sid);if(gameData.coin<cost){showToast('コインが不足しています');return;}
  gameData.coin-=cost;if(!curCharData.skillLevels)curCharData.skillLevels={};
  curCharData.skillLevels[sid]=(curCharData.skillLevels[sid]||0)+1;
  saveGame();renderSkillTab();updateHubHeader();showToast('✨ '+SKILLS[sid].name+' Lv.'+(lv+1)+'！');
}

var ACHIEVEMENTS=[
  {id:'first_win', name:'初勝利',     icon:'⚔', desc:'このキャラで初めてクリア', target:1,   getValue:function(){return getCS('kills');}},
  {id:'kills10',   name:'撃破10',     icon:'💀', desc:'敵を10体倒す',             target:10,  getValue:function(){return getCS('kills');}},
  {id:'kills100',  name:'百戦錬磨',   icon:'🌟', desc:'敵を100体倒す',            target:100, getValue:function(){return getCS('kills');}},
  {id:'kills500',  name:'殲滅者',     icon:'☠', desc:'敵を500体倒す',            target:500, getValue:function(){return getCS('kills');}},
  {id:'coin100',   name:'コレクター', icon:'🪙', desc:'コイン100枚獲得',          target:100, getValue:function(){return getCS('totalCoins');}},
  {id:'coin1000',  name:'大富豪',     icon:'💰', desc:'コイン1000枚獲得',         target:1000,getValue:function(){return getCS('totalCoins');}},
  {id:'stage5',    name:'ゾーン1制覇',icon:'🌿', desc:'ステージ5をクリア',        target:5,   getValue:function(){return Math.max(0,gameData.level-1);}},
  {id:'stage10',   name:'砂漠の勇者', icon:'🏜', desc:'ステージ10をクリア',       target:10,  getValue:function(){return Math.max(0,gameData.level-1);}},
  {id:'stage25',   name:'虚空の征服者',icon:'🌀',desc:'全ステージクリア！',       target:25,  getValue:function(){return Math.max(0,gameData.level-1);}},
  {id:'combo5',    name:'コンボマスター',icon:'🔥',desc:'コンボ5以上を達成',      target:1,   getValue:function(){return getCS('maxCombo')>=5?1:0;}},
  {id:'challenge3',name:'チャレンジャー',icon:'⚡',desc:'チャレンジモード3回クリア',target:3, getValue:function(){return getCS('challengeClears');}},
  {id:'equip3',    name:'装備マニア', icon:'🛡', desc:'3スロットを全て装備',      target:1,   getValue:function(){if(!curCharData||!curCharData.equipped)return 0;var e=curCharData.equipped;return(e.weapon&&e.armor&&e.acc)?1:0;}},
  {id:'awaken',    name:'覚醒者',     icon:'💎', desc:'VOID AWAKENINGを解放',     target:1,   getValue:function(){return curCharData&&curCharData.awakened?1:0;}},
  {id:'farm10',    name:'周回王',     icon:'🔄', desc:'同ステージ10回以上クリア', target:10,  getValue:function(){var m=0;Object.values(gameData.stats.clears||{}).forEach(function(v){if(v>m)m=v;});return m;}},
  {id:'exclusive', name:'専用装備使い',icon:'🌙',desc:'キャラ専用装備を装備する', target:1,   getValue:function(){var inv=getSharedInventory();var eq=curCharData&&curCharData.equipped?curCharData.equipped:{};return['weapon','armor','acc'].some(function(s){var uid=eq[s];if(!uid)return false;var it=inv.find(function(i){return i._uid===uid;});return it&&it.charOnly===selectedCharId;})?1:0;}},
];
function getCS(key){return curCharData&&curCharData.charStats&&curCharData.charStats[key]||0;}
function addCS(key,val){if(!curCharData)return;if(!curCharData.charStats)curCharData.charStats={};curCharData.charStats[key]=(curCharData.charStats[key]||0)+(val||1);}
function checkAchievements(){
  if(!curCharData)return; if(!curCharData.unlockedAchieves)curCharData.unlockedAchieves=[];
  ACHIEVEMENTS.forEach(function(a){
    if(curCharData.unlockedAchieves.indexOf(a.id)>=0)return;
    var v=a.getValue();if(v>=a.target){curCharData.unlockedAchieves.push(a.id);showToast('🏆 実績解除: '+a.name);saveGame();}
  });
}
function isAchieveUnlocked(id){return curCharData&&curCharData.unlockedAchieves&&curCharData.unlockedAchieves.indexOf(id)>=0;}

function getRank(){
  var k=getCS('kills');
  if(k>=500)return{name:'VOID SOVEREIGN',color:'#ff00ff'};
  if(k>=200)return{name:'DARKNESS LORD',color:'#cc66ff'};
  if(k>=100)return{name:'IRON GENERAL',color:'#ffd84d'};
  if(k>=50) return{name:'BATTLE ACE',color:'#ff8833'};
  if(k>=20) return{name:'FIELD AGENT',color:'#4499ff'};
  if(k>=5)  return{name:'RECRUIT',color:'#44ffaa'};
  return{name:'ROOKIE',color:'#667'};
}

function saveGame(){
  var key = getSaveKey();
  gameData._savedAt = Date.now();
  try{ localStorage.setItem(key, JSON.stringify({gameData:gameData,selectedCharId:selectedCharId})); }catch(e){}
  var b=document.getElementById('save-status');if(b){b.textContent='💾 SAVED';b.style.color='#44ffaa';}
  cloudSave();
}

function loadSaveFromKey(key){
  try{
    var raw=localStorage.getItem(key);if(!raw)return false;
    var d=JSON.parse(raw);if(!d||!d.gameData)return false;
    gameData=d.gameData;
    if(!gameData.roster)    gameData.roster={};
    if(!gameData.inventory) gameData.inventory=[];
    if(!gameData.stats)     gameData.stats={kills:0,totalCoins:0,clears:{}};
    Object.keys(gameData.roster).forEach(function(cid){
      var r=gameData.roster[cid];
      if(r.inventory&&r.inventory.length>0){r.inventory.forEach(function(item){gameData.inventory.push(item);});r.inventory=[];}
      if(!r.charStats)r.charStats={kills:0,totalCoins:0,maxCombo:0,challengeClears:0};
    });
    selectedCharId=d.selectedCharId;return true;
  }catch(e){return false;}
}

function loadSave(){ return loadSaveFromKey(getSaveKey()); }

function checkSaveOnStart(){
  ['start-save-info','continue-btn','delete-btn'].forEach(function(id){var el=document.getElementById(id);if(el)el.style.display='none';});
  var key = getSaveKey();
  if(localStorage.getItem(key)){
    document.getElementById('start-save-info').style.display='block';
    document.getElementById('continue-btn').style.display='inline-block';
    document.getElementById('delete-btn').style.display='inline-block';
  }
}

function continueGame(){
  if(!selectedCharId){switchScreen('charselect');return;}
  selectedCharDef=CHARACTER_DEFS.find(function(c){return c.id===selectedCharId;});
  if(!selectedCharDef){switchScreen('charselect');return;}
  if(!gameData.roster[selectedCharId])gameData.roster[selectedCharId]={upgrades:{hp:0,ep:0,atk:0,def:0},awakened:false,awakened2:false,skillLevels:{},equipped:{weapon:null,armor:null,acc:null},charStats:{kills:0,totalCoins:0,maxCombo:0,challengeClears:0},unlockedAchieves:[]};
  curCharData=gameData.roster[selectedCharId];
  if(!curCharData.charStats)curCharData.charStats={kills:0,totalCoins:0,maxCombo:0,challengeClears:0};
  if(!curCharData.unlockedAchieves)curCharData.unlockedAchieves=[];
  recalcStats();switchScreen('hub');
}

function newGameConfirm(){
  if(!localStorage.getItem(getSaveKey())){_startNewGame();return;}
  showConfirm('⚠','既存データを上書きしますか？','セーブデータが上書きされます。\nこの操作は元に戻せません。','var(--orange)',function(){_startNewGame();});
}
function _startNewGame(){
  gameData={coin:0,core:0,dust:0,level:1,roster:{},inventory:[],stats:{kills:0,totalCoins:0,clears:{}}};
  selectedCharId=null;switchScreen('charselect');
}
function deleteSave(){
  showConfirm('🗑','セーブデータを削除しますか？','この操作は元に戻せません。\n全てのデータが失われます。','var(--magenta)',function(){
    localStorage.removeItem(getSaveKey());
    if(firebaseReady&&fbDb&&accountInfo){fbDb.collection('saves').doc(accountInfo.uid).delete().catch(function(){});}
    gameData={coin:0,core:0,dust:0,level:1,roster:{},inventory:[],stats:{kills:0,totalCoins:0,clears:{}}};
    selectedCharId=null;
    ['start-save-info','continue-btn','delete-btn'].forEach(function(id){var el=document.getElementById(id);if(el)el.style.display='none';});
    showToast('🗑 セーブデータを削除しました');
  });
}

function switchScreen(id){
  document.querySelectorAll('.screen').forEach(function(s){s.classList.remove('active');});
  document.getElementById('screen-'+id).classList.add('active');
  if(id==='start'){bgType='void';checkSaveOnStart();}
  if(id==='hub'){bgType='void';updateHubUI();}
  if(id==='map'){bgType='void';buildMap();}
}

// いずれかのキャラがWorld2を解放済みか確認
function isRyuuUnlocked(){
  if(!gameData.roster)return false;
  return Object.keys(gameData.roster).some(function(cid){
    var r=gameData.roster[cid];
    return r&&r.charLevel&&r.charLevel>=26;
  });
}

function initCharSelect(){
  var grid=document.getElementById('char-grid');grid.innerHTML='';
  var ryuuUnlocked=isRyuuUnlocked();
  CHARACTER_DEFS.forEach(function(cd){
    var locked=cd.id==='ryuu'&&!ryuuUnlocked;
    var card=document.createElement('div');card.className='char-card';card.id='cc-'+cd.id;
    card.style.borderColor=locked?'#1a2040':cd.color+'44';
    if(locked)card.style.opacity='0.5';
    var cvs=document.createElement('canvas');cvs.width=128;cvs.height=128;cvs.style.cssText='image-rendering:pixelated;image-rendering:crisp-edges;width:84px;height:84px;display:block;margin:0 auto 4px;';
    card.appendChild(cvs);if(cd.sprite.id)initBlink(cd.sprite.id);cd.sprite.draw(cvs.getContext('2d'),0);
    if(locked){
      // 鍵アイコンをcanvasの上に重ねる
      var lockDiv=document.createElement('div');
      lockDiv.style.cssText='position:absolute;top:8px;left:50%;transform:translateX(-50%);font-size:28px;opacity:0.85;';
      lockDiv.innerText='🔒';card.style.position='relative';card.appendChild(lockDiv);
    }
    var info=document.createElement('div');
    var lockNote=locked?'<div style="font-size:9px;color:#ff4400;margin-bottom:3px;font-weight:700;">WORLD 1 全制覇で解放</div>':'';
    info.innerHTML='<div class="sel-badge">✓</div>'+lockNote+'<div class="char-class-tag" style="color:'+(locked?'#334':cd.color)+'">'+cd.title+'</div><div class="char-name-big" style="color:'+(locked?'#445':cd.color)+'">'+cd.name+'</div><div class="char-flavor">'+cd.desc+'</div><div class="stat-row"><span>HP</span><span class="stat-val">'+cd.statD.hp+'</span></div><div class="stat-row"><span style="color:var(--cyan)">EP</span><span class="stat-val">'+cd.statD.ep+'</span></div><div class="stat-row"><span style="color:var(--magenta)">ATK</span><span class="stat-val">'+cd.statD.atk+'</span></div>';
    card.appendChild(info);
    card.addEventListener('click',function(){selectChar(cd.id);});
    grid.appendChild(card);
    animTargets.push({ctx:cvs.getContext('2d'),def:cd.sprite,tick:0});
  });
  startLoop();
}
function selectChar(id){
  if(id==='ryuu'&&!isRyuuUnlocked()){
    showToast('🔒 WORLD 1 を全制覇するとリュウが解放されます');return;
  }
  selectedCharId=id;document.querySelectorAll('.char-card').forEach(function(c){c.classList.remove('selected');});
  var el=document.getElementById('cc-'+id);if(el)el.classList.add('selected');
}
function confirmCharSelect(){
  if(!selectedCharId){alert('キャラクターを選んでください');return;}
  selectedCharDef=CHARACTER_DEFS.find(function(c){return c.id===selectedCharId;});
  if(!gameData.roster[selectedCharId])gameData.roster[selectedCharId]={upgrades:{hp:0,ep:0,atk:0,def:0},awakened:false,awakened2:false,skillLevels:{},equipped:{weapon:null,armor:null,acc:null},charStats:{kills:0,totalCoins:0,maxCombo:0,challengeClears:0},unlockedAchieves:[]};
  curCharData=gameData.roster[selectedCharId];
  if(!curCharData.charStats)curCharData.charStats={kills:0,totalCoins:0,maxCombo:0,challengeClears:0};
  if(!curCharData.unlockedAchieves)curCharData.unlockedAchieves=[];
  recalcStats();saveGame();switchScreen('hub');
}
function recalcStats(){
  var u=curCharData.upgrades||{};var eq=getEquipBonus();
  var awk=(curCharData.awakened?1.15:1)*(curCharData.awakened2?1.2:1);
  curCharData.maxHp =Math.floor((selectedCharDef.baseHp +(u.hp||0)*20+eq.hp)*awk);
  curCharData.maxEp =Math.floor((selectedCharDef.baseEp +(u.ep||0)*10+eq.ep)*awk);
  curCharData.atk   =Math.floor((selectedCharDef.baseAtk+(u.atk||0)*5 +eq.atk)*awk);
  curCharData.def   =Math.floor((selectedCharDef.baseDef+(u.def||0)*4 +eq.def)*awk);
  curCharData.hp=curCharData.maxHp;curCharData.ep=curCharData.maxEp;
}
function getUpgradeCost(type){var u=curCharData.upgrades||{};return type==='atk'?100+(u[type]||0)*45:type==='def'?80+(u[type]||0)*35:50+(u[type]||0)*22;}

function switchHubTab(tab){
  ['status','shop','equip','skills','achieve'].forEach(function(t){
    document.getElementById('tab-'+t).classList.toggle('active',t===tab);
    document.getElementById('tab-body-'+t).classList.toggle('active',t===tab);
  });
  if(tab==='equip')renderEquipTab();
  if(tab==='skills')renderSkillTab();
  if(tab==='achieve')renderAchieveTab();
  if(tab==='status')renderHubStatus();
}
function updateHubHeader(){
  document.getElementById('ui-coin').innerText=gameData.coin;
  document.getElementById('ui-core').innerText=gameData.core;
  document.getElementById('ui-dust').innerText=gameData.dust;
}
function updateHubUI(){
  updateHubHeader();renderHubStatus();renderShopTab();renderEquipTab();renderSkillTab();renderAchieveTab();
  var wrap=document.getElementById('hub-sprite-wrap');wrap.innerHTML='';
  var cvs=document.createElement('canvas');cvs.width=128;cvs.height=128;cvs.style.cssText='image-rendering:pixelated;image-rendering:crisp-edges;width:100px;height:100px;';
  wrap.appendChild(cvs);if(curCharData.awakened)cvs.classList.add('aura-active');
  if(window._hubE){var idx=animTargets.indexOf(window._hubE);if(idx>=0)animTargets.splice(idx,1);}
  window._hubE={ctx:cvs.getContext('2d'),def:selectedCharDef.sprite,tick:0};animTargets.push(window._hubE);startLoop();
  switchHubTab('status');
}
function renderHubStatus(){
  if(!curCharData||!selectedCharDef)return;
  document.getElementById('hub-cname').innerText=selectedCharDef.name; document.getElementById('hub-ctitle').innerText=selectedCharDef.title;
  document.getElementById('hub-hp').innerText=curCharData.maxHp; document.getElementById('hub-ep').innerText=curCharData.maxEp;
  document.getElementById('hub-atk').innerText=curCharData.atk; document.getElementById('hub-def').innerText=curCharData.def;
  document.getElementById('hub-maxlv').innerText=gameData.level; document.getElementById('hub-kills').innerText=getCS('kills'); document.getElementById('hub-totalcoin').innerText=getCS('totalCoins');
  var rank=getRank();var rb=document.getElementById('hub-rank-badge');
  rb.innerText=rank.name;rb.style.color=rank.color;rb.style.borderColor=rank.color;rb.style.border='1px solid';rb.style.background=rank.color+'22';
  var gs=document.getElementById('hub-gear-summary');if(!gs)return;gs.innerHTML='';
  var inv=getSharedInventory();
  ['weapon','armor','acc'].forEach(function(slot){
    var icons={'weapon':'🗡','armor':'🛡','acc':'💍'};
    var uid=curCharData.equipped&&curCharData.equipped[slot];
    var item=uid?inv.find(function(i){return i._uid===uid;}):null;
    var div=document.createElement('div');div.style.cssText='display:flex;justify-content:space-between;font-size:10px;padding:1px 0;';
    div.innerHTML='<span style="color:#445;">'+icons[slot]+' '+slot.toUpperCase()+'</span><span style="color:'+(item?RARITY_COLOR[item.rarity]:'#223')+';">'+(item?item.name:'なし')+'</span>';
    gs.appendChild(div);
  });
}
function renderShopTab(){
  var u=curCharData.upgrades||{};
  ['hp','ep','atk','def'].forEach(function(t){
    var el=document.getElementById('shop-lv-'+t);if(el)el.innerText='Lv.'+(u[t]||0);
    var ce=document.getElementById('cost-'+t);if(ce)ce.innerText=getUpgradeCost(t);
  });
  document.getElementById('btn-buy-awk').disabled=curCharData.awakened;
  document.getElementById('btn-buy-awk2').disabled=!curCharData.awakened||curCharData.awakened2;
  document.getElementById('forge-cost').innerText=3;
}
function renderEquipTab(){
  if(!curCharData)return;
  if(!curCharData.equipped)curCharData.equipped={weapon:null,armor:null,acc:null};
  var inv=getSharedInventory();
  var slots=document.getElementById('equip-slots');slots.innerHTML='';
  var slotDefs=[{id:'weapon',name:'ウェポン',icon:'🗡'},{id:'armor',name:'アーマー',icon:'🛡'},{id:'acc',name:'アクセサリ',icon:'💍'}];
  slotDefs.forEach(function(sd){
    var uid=curCharData.equipped[sd.id];
    var item=uid?inv.find(function(i){return i._uid===uid;}):null;
    var div=document.createElement('div');div.className='equip-slot'+(item?' has-item':'');
    if(item){
      div.style.borderColor=RARITY_COLOR[item.rarity];
      div.innerHTML='<div class="slot-icon">'+item.icon+'</div>'+(item.charOnly?'<div style="font-size:8px;color:var(--gold);font-weight:700;">★専用</div>':'')+'<div class="item-name" style="color:'+RARITY_COLOR[item.rarity]+'">'+item.name+'</div>'+'<div class="item-stat" style="color:var(--gold);">'+itemStatString(item)+'</div>'+'<div class="slot-name" style="margin-top:3px;cursor:pointer;color:var(--magenta);" onclick="unequipSlot(\''+sd.id+'\')">[ 外す ]</div>';
    } else {
      div.innerHTML='<div class="slot-icon" style="opacity:.3;">'+sd.icon+'</div><div class="slot-name">'+sd.name+'</div><div style="font-size:8px;color:#223;">インベントリから装備</div>';
    }
    slots.appendChild(div);
  });
  var grid=document.getElementById('inventory-grid');grid.innerHTML='';
  var emptyEl=document.getElementById('inv-empty');
  emptyEl.style.display=inv.length===0?'block':'none';
  document.getElementById('inv-count').innerText='('+inv.length+'/40)';
  inv.forEach(function(item){
    var myEq=curCharData.equipped&&Object.values(curCharData.equipped).indexOf(item._uid)>=0;
    var otherCid=getItemEquippedByOther(item._uid);
    var isExclusive=!!item.charOnly;
    var canEquip=!isExclusive||(item.charOnly===selectedCharId);
    var otherDef=otherCid?CHARACTER_DEFS.find(function(c){return c.id===otherCid;}):null;
    var div=document.createElement('div');div.className='inv-item'+(myEq?' equipped':'');
    if(otherCid)div.style.opacity='0.45';
    if(isExclusive&&!canEquip)div.style.opacity='0.3';
    var label='';
    if(myEq)label='<div style="font-size:8px;color:var(--gold);margin-top:1px;">✓ 装備中</div>';
    else if(otherCid)label='<div style="font-size:8px;color:var(--magenta);margin-top:1px;">'+(otherDef?otherDef.name:'他キャラ')+'使用中</div>';
    else if(isExclusive&&!canEquip){var ownerDef=CHARACTER_DEFS.find(function(c){return c.id===item.charOnly;});label='<div style="font-size:8px;color:#556;margin-top:1px;">'+(ownerDef?ownerDef.name:'他キャラ')+'専用</div>';}
    else label='<div style="font-size:8px;color:#445;margin-top:2px;display:flex;gap:4px;justify-content:center;"><span style="cursor:pointer;color:var(--cyan);" onclick="equipItem(\''+item._uid+'\')">装備</span><span style="cursor:pointer;color:var(--magenta);" onclick="disassembleItem(\''+item._uid+'\')">分解</span></div>';
    div.innerHTML='<div class="inv-icon">'+item.icon+'</div>'+(item.charOnly?'<div style="font-size:7px;color:var(--gold);font-weight:700;line-height:1;">★専用</div>':'')+'<div class="inv-name" style="color:'+RARITY_COLOR[item.rarity]+'">'+item.name+'</div>'+'<div class="inv-stats">'+itemStatString(item)+'</div>'+label;
    if(myEq){div.addEventListener('click',function(){unequipSlot(Object.keys(curCharData.equipped).find(function(s){return curCharData.equipped[s]===item._uid;}));});}
    grid.appendChild(div);
  });
}
function renderSkillTab(){
  var list=document.getElementById('skill-upgrade-list');list.innerHTML='';
  if(!selectedCharDef)return;
  selectedCharDef.skills.forEach(function(sid){
    var sk=SKILLS[sid];var lv=getSkillLevel(sid);var cost=getSkillUpgradeCost(sid);
    var row=document.createElement('div');row.className='skill-upgrade-row';
    var pips='';for(var i=0;i<5;i++)pips+='<div class="skill-lv-pip'+(i<lv?' filled':'')+'"></div>';
    row.innerHTML='<div style="flex:1;"><div style="font-weight:700;font-size:12px;color:'+(sk.isUlt?'var(--gold)':'var(--cyan)')+'">'+sk.name+(sk.isUlt?' <span style="font-size:9px;color:var(--orange);">[必殺技・1回/バトル]</span>':'')+'</div><div style="font-size:9px;color:#556;">'+sk.desc+'</div><div class="skill-lv-bar">'+pips+'</div><div style="font-size:9px;color:#778;">倍率: ×'+getSkillMult(sid).toFixed(2)+(lv<5?' → ×'+(1+(lv+1)*0.15).toFixed(2):'【MAX】')+'</div></div>';
    if(lv<5){var btn=document.createElement('button');btn.className='btn sm';btn.innerHTML='🪙 '+cost;btn.addEventListener('click',function(){upgradeSkill(sid);});row.appendChild(btn);}
    else{var maxSpan=document.createElement('span');maxSpan.style.cssText='font-size:10px;color:var(--gold);font-weight:900;';maxSpan.innerText='MAX';row.appendChild(maxSpan);}
    list.appendChild(row);
  });
}
function renderAchieveTab(){
  var grid=document.getElementById('achieve-grid');grid.innerHTML='';
  ACHIEVEMENTS.forEach(function(a){
    var unlocked=isAchieveUnlocked(a.id);var val=a.getValue();var pct=Math.min(1,val/a.target);
    var card=document.createElement('div');card.className='achieve-card'+(unlocked?' unlocked':'');
    card.innerHTML='<div class="achieve-icon"'+(unlocked?'':' style="filter:grayscale(1);opacity:.3;"')+'>'+a.icon+'</div><div><div class="achieve-name" style="color:'+(unlocked?'var(--gold)':'#445')+'">'+a.name+'</div><div class="achieve-desc">'+a.desc+'</div><div class="achieve-prog">'+(unlocked?'✅ UNLOCKED':val+' / '+a.target)+'</div><div class="prog-bar"><div class="prog-fill" style="width:'+(pct*100)+'%"></div></div></div>';
    grid.appendChild(card);
  });
}

function buyUpgrade(type){
  var cost=getUpgradeCost(type);if(gameData.coin<cost){showToast('コインが不足');return;}
  gameData.coin-=cost;if(!curCharData.upgrades)curCharData.upgrades={};
  curCharData.upgrades[type]=(curCharData.upgrades[type]||0)+1;recalcStats();saveGame();renderShopTab();renderHubStatus();updateHubHeader();showToast('✅ '+type.toUpperCase()+' 強化完了！');
}
function buyVoidAwaken(){if(curCharData.awakened)return;if(gameData.core<3){showToast('💎 コアが不足');return;}gameData.core-=3;curCharData.awakened=true;recalcStats();saveGame();renderShopTab();renderHubStatus();updateHubHeader();showToast('🌟 VOID AWAKENING！');}
function buyVoidAwaken2(){if(!curCharData.awakened||curCharData.awakened2)return;if(gameData.core<8){showToast('💎 コアが不足');return;}gameData.core-=8;curCharData.awakened2=true;recalcStats();saveGame();renderShopTab();renderHubStatus();updateHubHeader();showToast('💥 SECOND AWAKENING！');}

function buildMap(){
  document.getElementById('map-coin').innerText=gameData.coin;
  var body=document.getElementById('map-body');body.innerHTML='';
  for(var z=0;z<ZONES.length;z++){
    var zone=ZONES[z],zStart=z*5+1,zEnd=z*5+5;
    var block=document.createElement('div');block.className='zone-block';block.style.borderColor=zone.color+'22';
    var hdr=document.createElement('div');hdr.className='zone-header';
    hdr.style.background='linear-gradient(90deg,'+zone.color+'1a,transparent)';hdr.style.color=zone.color;
    hdr.innerHTML='<span style="font-size:15px;">'+zone.emoji+'</span><span>ZONE '+(z+1)+': '+zone.name+'</span>';
    block.appendChild(hdr);
    var row=document.createElement('div');row.className='zone-stages';
    for(var s=zStart;s<=zEnd;s++){
      if(s>zStart){var line=document.createElement('div');line.className='stage-line';line.style.background=s<=gameData.level?zone.color+'55':'#1a2040';row.appendChild(line);}
      var node=document.createElement('div');node.className='stage-node';
      var isBoss=(s-1)%5===4,isDone=s<gameData.level,isCurrent=s===gameData.level,isLocked=s>gameData.level;
      var clears=(gameData.stats.clears&&gameData.stats.clears[s])||0;
      var circle=document.createElement('div');circle.className='stage-circle'+(isBoss?' boss':'')+(isCurrent?' current':'')+(isLocked?' locked':'');
      circle.style.borderColor=isBoss?'var(--gold)':zone.color;circle.style.color=isBoss?'var(--gold)':zone.color;
      if(isDone||isCurrent)circle.style.background=zone.color+'22';
      var sn=document.createElement('span');sn.className='sn';sn.innerText=isDone?'✓':s;circle.appendChild(sn);
      var lbl=document.createElement('div');lbl.className='stage-label';lbl.style.color=isBoss?'var(--gold)':zone.color;lbl.innerText=isBoss?'BOSS':'Lv.'+s;
      var clrSpan=document.createElement('div');clrSpan.className='stage-clears';clrSpan.innerText=clears>0?'×'+clears:'';
      node.appendChild(circle);node.appendChild(lbl);node.appendChild(clrSpan);
      if(!isLocked){
        (function(stg,cir){
          cir.addEventListener('click',function(e){e.stopPropagation();startBattle(stg,false);});
          var pressTimer=null;
          cir.addEventListener('touchstart',function(){pressTimer=setTimeout(function(){startBattle(stg,true);},600);});
          cir.addEventListener('touchend',function(){clearTimeout(pressTimer);});
          cir.addEventListener('dblclick',function(){startBattle(stg,true);});
          if(clears>0&&!isBoss){var cb=document.createElement('div');cb.className='challenge-badge';cb.innerText='CH';cir.appendChild(cb);}
        })(s,circle);
      }
      row.appendChild(node);
    }
    block.appendChild(row);body.appendChild(block);
  }
  var hint=document.createElement('div');
  hint.style.cssText='text-align:center;padding:10px;font-size:10px;color:#334;';
  hint.innerText='💡 クリア済みステージは周回可能 | ダブルタップ/長押し = チャレンジモード (+50%報酬)';
  body.appendChild(hint);
}

function startBattle(stage,challenge){
  currentBattleStage=stage;isChallenge=!!challenge;
  curCharData.hp=curCharData.maxHp;curCharData.ep=curCharData.maxEp;
  bState={player:{buffs:[]},enemy:{buffs:[]}};battleLocked=false;comboCount=0;
  ultUsedThisBattle = false;
  var info=getStageInfo(stage);var zone=info.zone;
  bgType=info.isBoss?'boss':zone.id;
  var eInfo=getEnemyForStage(stage,isChallenge);
  eData.cur={name:eInfo.name,maxHp:eInfo.maxHp,hp:eInfo.maxHp,atk:eInfo.atk,spriteDef:eInfo.sprite,isBoss:eInfo.isBoss};
  document.getElementById('stage-name-txt').innerText='STAGE '+stage+': '+zone.name+(info.isBoss?' [BOSS]':'');
  document.getElementById('challenge-banner').classList.toggle('show',isChallenge);
  if(info.isBoss){document.getElementById('vs-label').innerHTML='<div class="boss-warning">⚠BOSS⚠</div>VS';document.getElementById('enemy-card').style.borderColor='red';}
  else{document.getElementById('vs-label').innerHTML='VS';document.getElementById('enemy-card').style.borderColor='rgba(255,51,153,.45)';}
  document.getElementById('log-panel').innerHTML='';
  logMsg((info.isBoss?'⚠ BOSS: ':'')+'【'+eData.cur.name+'】'+(isChallenge?' [チャレンジ]':'')+' 出現！',info.isBoss?'#ff3333':zone.color);
  buildCmds();switchScreen('battle');
  document.getElementById('player-card').style.borderColor=selectedCharDef.color+'88';
  document.getElementById('b-pname').innerText=selectedCharDef.name;
  document.getElementById('b-pname').style.color=selectedCharDef.color;
  renderBattleEquipTags();
  if(pAnim)pAnim.stop();if(eAnim)eAnim.stop();
  pAnim=new HDAnimator('player-sprite',selectedCharDef.sprite);eAnim=new HDAnimator('enemy-sprite',eData.cur.spriteDef);
  if(curCharData.awakened)document.getElementById('player-sprite').classList.add('aura-active');
  else document.getElementById('player-sprite').classList.remove('aura-active');
  pAnim.start();eAnim.start();updateBUI();updateComboUI();isPlayerTurn=true;
}

function renderBattleEquipTags(){
  var row=document.getElementById('b-equip-tags');if(!row)return;row.innerHTML='';
  var eq=getEquipBonus();
  if(eq.atk)row.innerHTML+='<span class="b-equip-tag">ATK+'+eq.atk+'</span>';
  if(eq.hp)row.innerHTML+='<span class="b-equip-tag">HP+'+eq.hp+'</span>';
  if(eq.def)row.innerHTML+='<span class="b-equip-tag">DEF+'+eq.def+'</span>';
  if(eq.ep)row.innerHTML+='<span class="b-equip-tag">EP+'+eq.ep+'</span>';
}

function retreatBattle(){
  showConfirm('🏳','撤退しますか？','現在の戦闘を中断してマップに戻ります。\nクリア報酬は獲得できません。','#667',function(){
    if(pAnim)pAnim.stop();if(eAnim)eAnim.stop();saveGame();switchScreen('map');
  });
}

function buildCmds(){
  var pnl=document.getElementById('cmd-panel');pnl.innerHTML='';
  selectedCharDef.skills.forEach(function(sid){
    var sk=SKILLS[sid];var lv=getSkillLevel(sid);
    var b=document.createElement('button');b.className='btn skill-btn';if(sk.isUlt)b.classList.add('skill-ult');
    b.dataset.sid=sid;
    b.innerHTML=sk.name+'<span style="opacity:.5;font-size:8px;margin-left:3px;">EP:'+sk.ep+(lv>0?' Lv.'+lv:'')+''+(sk.isUlt?' ★1回':'')+'</span>';
    b.addEventListener('click',function(){execPlayerTurn(sid);});
    pnl.appendChild(b);
  });
}

function updateBUI(){
  document.getElementById('battle-coin').innerText=gameData.coin;
  document.getElementById('p-hp-txt').innerText=Math.floor(curCharData.hp);document.getElementById('p-maxhp').innerText=curCharData.maxHp;
  document.getElementById('p-ep-txt').innerText=Math.floor(curCharData.ep);document.getElementById('p-maxep').innerText=curCharData.maxEp;
  document.getElementById('e-hp-txt').innerText=Math.floor(eData.cur.hp);document.getElementById('e-maxhp').innerText=eData.cur.maxHp;
  document.getElementById('b-ename').innerText=eData.cur.name;
  var pHp=curCharData.hp/curCharData.maxHp*100,pEp=curCharData.ep/curCharData.maxEp*100,eHp=eData.cur.hp/eData.cur.maxHp*100;
  document.getElementById('p-hp-bar').style.width=Math.max(0,pHp)+'%';
  document.getElementById('p-hp-bar').style.background=pHp<25?'linear-gradient(90deg,#cc0000,#ff3300)':'linear-gradient(90deg,#00cc55,#44ffaa)';
  document.getElementById('p-ep-bar').style.width=Math.max(0,pEp)+'%';
  document.getElementById('e-hp-bar').style.width=Math.max(0,eHp)+'%';
  if(isPlayerTurn&&!battleLocked){
    document.querySelectorAll('.skill-btn').forEach(function(b){
      var sk=SKILLS[b.dataset.sid];
      if(!sk)return;
      if(sk.isUlt&&ultUsedThisBattle){
        b.disabled=true;
        b.classList.add('ult-used');
      } else {
        b.disabled=curCharData.ep<sk.ep;
        b.classList.remove('ult-used');
      }
    });
  }
  renderEfx('player-efx',bState.player.buffs);renderEfx('enemy-efx',bState.enemy.buffs);
}

function refreshUltButtons(){
  document.querySelectorAll('.skill-btn').forEach(function(b){
    var sk=SKILLS[b.dataset.sid];if(!sk||!sk.isUlt)return;
    if(ultUsedThisBattle){ b.disabled=true; b.classList.add('ult-used'); }
  });
}

function renderEfx(id,buffs){var el=document.getElementById(id);el.innerHTML='';buffs.forEach(function(b){var sp=document.createElement('span');sp.className='efx '+((b.type==='poison'||b.type==='atk_down')?'efx-debuff':'efx-buff');sp.innerText=b.name+'('+b.duration+')';el.appendChild(sp);});}
function logMsg(msg,color){var pnl=document.getElementById('log-panel');pnl.innerHTML+='<div class="log-line" style="color:'+(color||'#556')+'">'+msg+'</div>';pnl.scrollTop=pnl.scrollHeight;}
function toggleBtns(dis){document.querySelectorAll('.skill-btn').forEach(function(b){if(!dis)return;b.disabled=true;});}

function addCombo(){comboCount=Math.min(9,comboCount+1);if(!gameData.stats.maxCombo||comboCount>gameData.stats.maxCombo)gameData.stats.maxCombo=comboCount;if(comboCount>getCS('maxCombo'))addCS('maxCombo',comboCount-getCS('maxCombo'));updateComboUI();}
function resetCombo(){comboCount=0;updateComboUI();}
function updateComboUI(){var el=document.getElementById('combo-display');if(!el)return;if(comboCount>=2){el.innerText=comboCount+'× COMBO';el.classList.add('show');}else{el.classList.remove('show');}}
function getComboMult(){return 1+(comboCount*0.06);}

function playCutscene(callback){
  var cs=selectedCharDef.cutscene,layer=document.getElementById('cutscene-layer'),titleEl=document.getElementById('cs-title'),linesEl=document.getElementById('cs-lines-container'),charCvs=document.getElementById('cs-canvas'),bgFlash=document.getElementById('cs-bg-flash');
  layer.style.display='flex';titleEl.innerText=selectedCharDef.ultName||selectedCharDef.name;titleEl.style.color=cs.textColor;titleEl.style.textShadow='0 0 28px '+cs.textColor;
  bgFlash.style.background=cs.bgColor;bgFlash.style.animation='none';void bgFlash.offsetWidth;bgFlash.style.animation='csFlash 1.5s forwards';
  charCvs.classList.remove('cs-anim-char');titleEl.classList.remove('cs-anim-text');void charCvs.offsetWidth;
  var ctx=charCvs.getContext('2d');pxclr(ctx);selectedCharDef.sprite.draw(ctx,30);
  charCvs.classList.add('cs-anim-char');titleEl.classList.add('cs-anim-text');
  linesEl.style.color=cs.textColor;
  function showLine(i){if(i>=cs.lines.length)return;linesEl.innerText=cs.lines[i];linesEl.style.opacity='1';setTimeout(function(){linesEl.style.opacity='0';setTimeout(function(){showLine(i+1);},180);},280);}
  setTimeout(function(){showLine(0);},80);
  setTimeout(function(){layer.style.display='none';callback();},1500);
}

function execPlayerTurn(sid){
  var sk=SKILLS[sid];
  if(!isPlayerTurn||battleLocked||curCharData.ep<sk.ep)return;
  if(sk.isUlt&&ultUsedThisBattle){ showToast('⚡ 必殺技はバトル中1回のみ使用できます！'); return; }
  isPlayerTurn=false;battleLocked=true;toggleBtns(true);curCharData.ep-=sk.ep;
  logMsg(selectedCharDef.name+'の【'+sk.name+'】！',selectedCharDef.color);
  if(sk.isUlt){ ultUsedThisBattle=true; logMsg('⚡ 必殺技発動！（このバトル中は使用不可になります）','var(--gold)'); }
  var doAction=function(){
    var ps=document.getElementById('player-sprite');
    if(ps){ps.style.transition='transform .12s';ps.style.transform='scale(1.2) translateX(8px)';setTimeout(function(){ps.style.transform='';},200);}
    sk.action(curCharData,eData.cur,bState.enemy);updateBUI();refreshUltButtons();if(checkEnd())return;
    setTimeout(function(){processTurn(curCharData,bState.player,selectedCharDef.name);if(checkEnd())return;setTimeout(enemyTurn,650);},500);
  };
  if(sk.isUlt)playCutscene(doAction);else doAction();
}

function enemyTurn(){
  var e=eData.cur,heavy=e.isBoss?(Math.random()<.4):(Math.random()<.3);
  logMsg(e.name+'の'+(heavy?'【強攻撃】':'【攻撃】')+'！','#ff4466');
  resetCombo();
  var es=document.getElementById('enemy-sprite');
  if(es){es.style.transition='transform .12s';es.style.transform='scale(1.2) translateX(-8px)';setTimeout(function(){es.style.transform='';},200);}
  dealDmg(eData.cur,curCharData,heavy?1.7:1.0,bState.player);updateBUI();if(checkEnd())return;
  setTimeout(function(){
    processTurn(eData.cur,bState.enemy,e.name);if(checkEnd())return;
    curCharData.ep=Math.min(curCharData.maxEp,curCharData.ep+13);isPlayerTurn=true;battleLocked=false;updateBUI();refreshUltButtons();logMsg('▶ ターン開始','#334');
  },500);
}

function dealDmg(atk,def,mult,defState){
  var atkState=(atk===curCharData)?bState.player:bState.enemy;var av=atk.atk||10;
  atkState.buffs.forEach(function(b){if(b.type==='atk_up')av*=1.5;if(b.type==='atk_down')av*=.75;});
  defState.buffs.forEach(function(b){if(b.type==='def_up')mult*=.5;});
  var comboM=(atk===curCharData)?getComboMult():1;
  var defStat=(def===curCharData)?curCharData.def:0;
  var dmg=Math.max(1,Math.floor(av*mult*comboM*(.88+Math.random()*.26)-defStat*0.4));
  def.hp=Math.max(0,def.hp-dmg);
  logMsg(dmg+' ダメージ！'+(comboM>1?' COMBO×'+comboCount+'!':''),'#aaa');
  spawnPop(def===eData.cur?'enemy-card':'player-card',dmg,'#ffffff');shakeCard(def===eData.cur?'enemy-card':'player-card');
  return dmg;
}
function applyBuff(target,stateObj,type,duration,name){var ex=null;for(var i=0;i<stateObj.buffs.length;i++)if(stateObj.buffs[i].type===type){ex=stateObj.buffs[i];break;}if(ex)ex.duration=duration;else stateObj.buffs.push({type:type,duration:duration,name:name});logMsg(name+'付与 ('+duration+'T)',(type==='poison'||type==='atk_down')?'var(--magenta)':'var(--green)');}
function healHP(target,pct){var amt=Math.floor(target.maxHp*pct);target.hp=Math.min(target.maxHp,target.hp+amt);logMsg('HP +'+amt+' 回復！','var(--green)');spawnPop(target===curCharData?'player-card':'enemy-card','+'+amt,'#44ffaa',true);}
function processTurn(charData,stateObj,name){
  stateObj.buffs.forEach(function(b){if(b.type==='poison'){var pd=Math.floor(charData.maxHp*.09);charData.hp=Math.max(0,charData.hp-pd);logMsg(name+' 毒 -'+pd,'var(--magenta)');spawnPop(charData===curCharData?'player-card':'enemy-card',pd,'#ff44aa');}});
  stateObj.buffs.forEach(function(b){b.duration--;});stateObj.buffs=stateObj.buffs.filter(function(b){return b.duration>0;});updateBUI();
}
function spawnPop(cardId,val,color,isHeal){
  var card=document.getElementById(cardId);if(!card)return;
  var pop=document.createElement('div');pop.className='dmg-pop';pop.innerText=val;pop.style.color=color;
  pop.style.top=(8+Math.random()*28)+'%';pop.style.left=(10+Math.random()*40)+'%';pop.style.textShadow='0 0 8px '+color;
  card.appendChild(pop);setTimeout(function(){if(pop.parentNode)pop.remove();},850);
}
function shakeCard(id){var c=document.getElementById(id);if(!c)return;c.classList.remove('hit-anim');void c.offsetWidth;c.classList.add('hit-anim');setTimeout(function(){c.classList.remove('hit-anim');},300);}

function showDropPopup(item,callback){
  var overlay=document.createElement('div');overlay.className='item-drop-overlay';
  var rarityNames={common:'コモン',rare:'レア',epic:'エピック',legend:'レジェンド'};
  overlay.innerHTML='<div class="item-drop-box"><div style="font-size:11px;color:'+RARITY_COLOR[item.rarity]+';font-family:Orbitron,sans-serif;letter-spacing:2px;margin-bottom:4px;">'+rarityNames[item.rarity]+' DROP！</div><div class="item-drop-icon">'+item.icon+'</div><div class="item-drop-name" style="color:'+RARITY_COLOR[item.rarity]+'">'+item.name+'</div><div class="item-drop-stats">'+itemStatString(item)+'</div><button class="btn gold" style="margin-top:4px;" id="drop-ok-btn">GET！</button></div>';
  document.body.appendChild(overlay);
  document.getElementById('drop-ok-btn').addEventListener('click',function(){overlay.remove();callback();});
}

function checkEnd(){
  if(eData.cur.hp<=0){
    battleLocked=true;logMsg('🎉 VICTORY！','var(--green)');
    if(eAnim){eAnim.stop();var es=eAnim.cvs;if(es){es.style.transition='filter .5s,opacity .5s';es.style.filter='brightness(0)';es.style.opacity='.1';}}
    var baseCoin=Math.floor(22+Math.random()*30*Math.ceil(currentBattleStage/3));
    var coin=isChallenge?Math.floor(baseCoin*1.5):baseCoin;var dust=0;
    gameData.coin+=coin;
    gameData.stats.kills=(gameData.stats.kills||0)+1;
    gameData.stats.totalCoins=(gameData.stats.totalCoins||0)+coin;
    if(!gameData.stats.clears)gameData.stats.clears={};
    gameData.stats.clears[currentBattleStage]=(gameData.stats.clears[currentBattleStage]||0)+1;
    addCS('kills',1);addCS('totalCoins',coin);
    if(currentBattleStage>=gameData.level)gameData.level=currentBattleStage+1;
    logMsg('🪙 COIN ×'+coin+(isChallenge?' [チャレンジ+50%]':''),'var(--gold)');
    var coreChance=eData.cur.isBoss?1.0:(isChallenge?0.35:0.18);
    if(Math.random()<coreChance){gameData.core++;logMsg('💎 VOID CORE ×1 ドロップ！','var(--purple)');}
    var dustChance=isChallenge?0.6:0.3;
    if(Math.random()<dustChance){dust=Math.floor(1+Math.random()*2);gameData.dust+=dust;logMsg('🔮 ダスト ×'+dust+' ドロップ！','#cc99ff');}
    var itemChance=eData.cur.isBoss?0.85:(isChallenge?0.5:0.25);
    var doFinish=function(){
      if(eAnim&&eAnim.cvs){eAnim.cvs.style.filter='';eAnim.cvs.style.opacity='';}
      if(isChallenge){gameData.stats.challengeClears=(gameData.stats.challengeClears||0)+1;addCS('challengeClears',1);}
      checkAchievements();saveGame();
      showToast('🎊 Stage '+(isChallenge?'[CH] ':'')+'Clear！');
      setTimeout(function(){switchScreen('map');},900);
    };
    setTimeout(function(){
      var inv=getSharedInventory();
      if(Math.random()<itemChance&&inv.length<40){
        var item=rollItem(eData.cur.isBoss?'rare':isChallenge?'rare':'common',selectedCharId);addToInventory(item);
        showDropPopup(item,doFinish);
      } else {doFinish();}
    },1200);return true;
  }
  if(curCharData.hp<=0){
    battleLocked=true;logMsg('💀 AGENT DOWN...','var(--magenta)');resetCombo();saveGame();
    setTimeout(function(){showToast('😢 敗北…マップへ戻ります');setTimeout(function(){switchScreen('map');},900);},1400);return true;
  }
  return false;
}

function showToast(msg){var t=document.createElement('div');t.className='toast';t.innerText=msg;document.body.appendChild(t);setTimeout(function(){if(t.parentNode)t.remove();},2700);}

// ═══════════════════════ INIT ═══════════════════════
(function(){
  var saved = localStorage.getItem(ACCOUNT_KEY);
  if (saved) {
    try {
      accountInfo = JSON.parse(saved);
      updateAccountUI();
      onAccountSignIn(accountInfo);
    } catch(e) { localStorage.removeItem(ACCOUNT_KEY); }
  }
})();

checkSaveOnStart();
initCharSelect();
