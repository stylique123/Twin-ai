class Component extends DCLogic {
  componentDidMount() {
    this._hc = () => {
      const h = decodeURIComponent((location.hash || '').slice(1)); if (h.indexOf('make=') !== 0) return;
      const v = h.slice(5); const k = v.split(':')[0]; const n = v.slice(k.length + 1);
      const P = this.P(); let key = k === 'brand' ? 'b' : null;
      if (!key) Object.keys(P).forEach(x => { if (P[x].name === n) key = x; });
      if (!key) key = k === 'other' ? 'a0' : 'o0';
      const sub = Object.assign({}, (this.state || {}).sub || {}, { 2: key });
      this.setState({ step: 's1', mode: 2, sub });
    };
    this._hc(); addEventListener('hashchange', this._hc);
    this.t = setInterval(() => this.tick(), 500);
  }
  componentWillUnmount() { clearInterval(this.t); removeEventListener('hashchange', this._hc); }
  tick() {
    const s = this.state || {}; const st = s.step || 's1'; const now = Date.now(); const up = {};
    if (st === 'w1' && !s.w1slow) { const t = (s.wt || 0) + 1; const L = this.w1Steps().length; if (t > L * 3 + 1) { up.step = 'ang'; up.wt = 0; up.angState = s.angState || 'default'; } else up.wt = t; }
    if (st === 'w2' && !s.w2slow && !s.w2fail) { const n = (s.w2n || 0) + 1; if (n <= 22) up.w2n = n; }
    if (s.refState === 'loading') { const r = (s.refN || 0) + 1; if (r > 6) { up.refState = 'found'; up.refN = 0; } else up.refN = r; }
    if (s.toastT && now > s.toastT) { up.toast = ''; up.toastT = 0; }
    if (s.rfT && now > s.rfT) up.rfT = 0;
    if (Object.keys(up).length) this.setState(up);
  }
  P() {
    return {
      b: { name: 'Maya’s Coffee', short: 'Your business', kind: 'brand', thumb: 'linear-gradient(135deg,#FFB347,#FF5B7B)', know: '5 things' },
      o0: { name: 'Signature Blend Beans', short: 'Signature Blend', kind: 'own', thumb: 'linear-gradient(150deg,#5A3A22,#1A120E)', know: '12 oz $18' },
      o1: { name: 'Single-Origin Limited Release', short: 'Single-Origin', kind: 'own', thumb: 'linear-gradient(150deg,#3B4A2A,#12160E)', know: 'Needs a price first', amber: true, need: true },
      o2: { name: 'House Espresso', short: 'House Espresso', kind: 'own', thumb: 'linear-gradient(150deg,#4A2A22,#160E0C)', know: 'Two origins on file. Which is right?', amber: true, conflict: true },
      o3: { name: 'Cart catering', short: 'Cart catering', kind: 'own', thumb: 'linear-gradient(150deg,#4A2A36,#160E12)', know: '3 things' },
      a0: { name: 'Northfield Gooseneck Kettle', short: 'Northfield Kettle', kind: 'other', tag: 'AFFILIATE', tagC: '#65E5D8', thumb: 'linear-gradient(150deg,#2A2A33,#101014)', know: 'Affiliate · 10%' },
      a1: { name: 'Crema Oat Milk', short: 'Crema Oat Milk', kind: 'other', tag: 'SPONSORED', tagC: '#FF8FA4', thumb: 'linear-gradient(150deg,#3A3326,#12100C)', know: 'Sponsored · 2 videos by Nov 30' },
      n0: { name: 'Cold Brew Concentrate', short: 'Cold Brew', kind: 'own', thumb: 'linear-gradient(150deg,#2A3A44,#0E1216)', know: 'Just added · Twin will ask for the rest', amber: true },
      none: { name: 'No product', short: 'No product', kind: 'none', thumb: 'rgba(255,255,255,0.06)', know: 'Just you talking' }
    };
  }
  w1Steps() {
    const s = this.state || {}; const mode = s.mode === undefined ? 2 : s.mode; const P = this.P(); const sb = (s.sub || {})[mode]; const nm = sb && P[sb] ? P[sb].short : 'Signature Blend';
    if (mode === 0 || mode === 3) return [['Matching it to what you know', 'Found 3 things you can say'], ['Getting three directions ready', 'Ready']];
    if (mode === 1) return [['Reading your idea', 'Reading this as: your story'], ['Finding what you’ve told Twin about this', 'Found 2 stories'], ['Getting three directions ready', 'Ready']];
    return [['Looking at ' + nm, 'Found 6 things Twin can say'], ['Checking what’s confirmed', '4 confirmed, 1 needs your yes'], ['Working out what this video needs', 'Done'], ['Getting three directions ready', 'Ready']];
  }
  ideaRead(t) {
    const x = (t || '').toLowerCase().trim();
    if (!x) return 'empty';
    if (x.replace(/[^a-z]/g, '').length < 10) return 'vague';
    if ((x.includes('signature') || x.includes('blend')) && (x.includes('single') || x.includes('origin'))) return 'two';
    if (x.includes('signature') || x.includes('blend')) return 'named';
    if (x.includes('chemex') || x.includes('aeropress')) return 'nothers';
    return 'ok';
  }
  renderVals() {
    const s = this.state || {}; const P = this.P(); const MOB = %%MOB%%;
    const step = s.step || 's1'; const mode = s.mode === undefined ? 2 : s.mode;
    const sub = s.sub || {}; const pu = s.pu || {}; const ln = s.ln || {}; const tk = s.tk || {};
    const set = (o) => this.setState(o);
    const toast = (m) => ({ toast: m, toastT: Date.now() + 2600 });
    const isRefLike = mode === 0 || mode === 3;
    // ---------- product row
    const subj = sub[mode]; const A = subj ? P[subj] : null;
    const brandOpts = ['Why I started', 'The part people get wrong', 'Announce something'];
    const prodOpts = ['Launch it', 'New or back in stock', 'Explain what it does', 'The part people get wrong', 'Get people to try it', 'Interest now, buying later', 'Answer what people keep asking', 'Turn a message into a video', 'Why I made it', 'The story behind it'];
    const ideaOpts = ['Tell a story', 'Teach something', 'Answer a question', 'Show how I do it', 'Something fun', 'Promote something I sell', 'Let Twin decide'];
    const optsFor = (k) => mode === 1 ? ideaOpts : (mode === 2 ? (k && P[k].kind === 'brand' ? brandOpts : prodOpts) : []);
    const curOpts = optsFor(subj); const puV = pu[mode]; const puName = puV !== undefined && curOpts.includes(puV) ? puV : undefined;
    const pickSub = (k) => () => {
      const o = { sub: Object.assign({}, sub, { [mode]: k }), sheet: false };
      const was = pu[mode];
      if (was !== undefined && mode === 2 && !optsFor(k).includes(was)) { o.pu = Object.assign({}, pu, { [mode]: undefined }); Object.assign(o, toast('Cleared “' + was + '”. It doesn’t fit ' + P[k].short.toLowerCase() + '.')); }
      else if (step === 'ang') Object.assign(o, { rfT: Date.now() + 1100 }, toast('Updated for ' + P[k].short));
      set(o);
    };
    const ownK = ['o0', 'o1', 'o2', 'o3'].concat(s.added ? ['n0'] : []);
    const pchip = (k) => { const p = P[k]; const on = subj === k; return { name: k === 'b' ? p.name : p.short, full: p.name, isB: k === 'b', dot: on ? '#FF5B7B' : 'transparent', ring: on ? '#FF5B7B' : 'rgba(255,255,255,0.25)', know: p.know, kc: p.amber ? '#FFCB85' : '#8D8475', thumb: p.thumb, tag: p.tag || '', hasTag: !!p.tag, tagC: p.tagC || '#8D8475', amber: !!p.amber, pick: pickSub(k), bd: on ? '#FF5B7B' : 'rgba(255,255,255,0.1)', bg: on ? 'rgba(255,91,123,0.10)' : '#0E0E12', mark: on ? '✓' : '', on }; };
    const prow = (k) => { const p = P[k]; const on = subj === k; return { name: p.name, ready: p.know, readyC: p.amber ? '#FFCB85' : '#8D8475', thumb: p.thumb, tag: p.tag || '', hasTag: !!p.tag, tagC: p.tagC || '#8D8475', amber: !!p.amber, pick: pickSub(k), bd: on ? '#FF5B7B' : 'rgba(255,255,255,0.06)', bg: on ? 'rgba(255,91,123,0.10)' : 'transparent' }; };
    // ---------- what's it for
    const opts = curOpts.map(t => { const on = puName === t; return { t, pick: () => set(Object.assign({ pu: Object.assign({}, pu, { [mode]: on ? undefined : t }) }, step === 'ang' ? Object.assign({ rfT: Date.now() + 1100 }, toast('Updated for “' + t.toLowerCase() + '”')) : {})), bd: on ? '#FF5B7B' : 'rgba(255,255,255,0.1)', bg: on ? 'rgba(255,91,123,0.10)' : 'transparent', fg: on ? '#F6F1E9' : '#B7AE9F' }; });
    // ---------- length
    const LO = isRefLike ? [['same', 'Same as theirs · 34s'], [60, '60s'], [90, '90s']] : [[30, '30s'], [60, '60s'], [90, '90s']];
    const lenV = ln[mode];
    const lens = LO.map(x => ({ t: x[1], pick: () => set(Object.assign({ ln: Object.assign({}, ln, { [mode]: x[0] }) }, step === 'ang' ? Object.assign({ rfT: Date.now() + 1100 }, toast('Updated for ' + x[1])) : {})), bg: x[0] === lenV ? '#F6F1E9' : 'transparent', fg: x[0] === lenV ? '#0B0B0E' : '#B7AE9F' }));
    const lenLabel = lenV === undefined ? '' : (LO.find(x => x[0] === lenV) || LO[0])[1];
    // ---------- reference / gallery
    const rs = s.refState || 'empty'; const rn = s.refN || 0;
    const GV = [['Stop buying dark roast', '@brewbyjo', '1.2M', 'ph-g1', 'Easy to film', '#8FEDE3'], ['My cart made $412 on a Tuesday', '@thecoffeecart', '860K', 'ph-g2', 'Needs a number from you', '#FFB347'], ['Roasting in a popcorn popper', '@smallbatchsam', '640K', 'ph-g3', 'Easy to film', '#8FEDE3'], ['3 coffee lies I believed', '@beanbybea', '410K', 'ph-g4', 'Easy to film', '#8FEDE3'], ['Day 1 of my coffee cart', '@cartdiaries', '1.9M', 'ph-g5', 'Easy to film', '#8FEDE3'], ['$5 latte vs $50 latte', '@labcoffee', '2.4M', 'ph-g6', 'Needs a studio', '#FF8FA4'], ['Why small batch tastes better', '@roastroom', '320K', 'ph-coach', 'Easy to film', '#8FEDE3'], ['Ask a roaster anything', '@hearthroast', '280K', 'ph-local', 'Easy to film', '#8FEDE3'], ['What $1 of coffee buys', '@cafemath', '1.1M', 'ph-realestate', 'Needs a number from you', '#FFB347'], ['Packing 200 bags by hand', '@packday', '540K', 'ph-agency', 'Easy to film', '#8FEDE3']];
    const gsel = s.gsel === undefined ? -1 : s.gsel; const G = GV[Math.max(0, gsel)];
    const refFound = mode === 3 ? gsel >= 0 : ['found', 'long', 'niche'].includes(rs);
    const refRead = mode === 3 ? gsel >= 0 : (rs === 'loading' || refFound);
    const gf = s.galFrom === undefined ? -1 : s.galFrom; const GF = GV[Math.max(0, gf)];
    const refInfo = mode === 0 && gf >= 0 ? { h: GF[1], t: '“' + GF[0] + '”', v: GF[2], cls: GF[3] } : mode === 3 ? { h: G[1], t: '“' + G[0] + '”', v: G[2], cls: G[3] } : { h: '@brewbyjo', t: '“Stop buying dark roast. Here’s what the bag isn’t telling you.”', v: '1.2M', cls: 'ph-g1' };
    const readSteps = [['Got the video', 1], ['Heard what they say', 3], ['Finding how it’s built', 5]].map((x, i) => { const done = rs !== 'loading' || rn >= x[1] + 1; const run = !done && (i === 0 || rs !== 'loading' || rn >= [0, 2, 4][i]); return { t: x[0], ic: done ? '✓' : '', spin: run && !done, c: done ? '#8FEDE3' : (run ? '#F6F1E9' : '#6E675C') }; });
    const REFERR = { private: ['Twin can’t open this video', 'It’s private or from a site Twin can’t read.'], nospeech: ['No one speaks in this video, so Twin can’t copy it', 'Twin learns how a video is built from what’s said.'], unsupported: ['This link isn’t supported yet', 'Try a TikTok, Instagram or YouTube link.'] };
    const refErr = REFERR[rs];
    const SW = [['The opening', 'opening'], ['The order of ideas', 'order'], ['The pace', 'pace'], ['The closing move', 'close']];
    const PARTS = [['The opening', 'first 3 seconds', 'A bold claim: “Stop buying dark roast.”', 'Your own bold claim about your coffee'], ['The order of ideas', 'whole video', 'Claim, then proof, then proof, then a question', 'Same order, your points'], ['The pace', '34 seconds', '4 parts, a cut every 3 to 4 seconds', 'Same timing and number of cuts'], ['The closing move', 'last 4 seconds', 'Ends by asking viewers a question', 'You end with your own question']];
    const TAKE = [['Just the opening', 'Copy how they open. Everything after is yours.', [1, 0, 0, 0], { opening: 1 }], ['The opening and the pace', 'Copy the opening and the timing. Your own order.', [1, 1, 1, 1], { opening: 1, pace: 1 }], ['The whole structure', 'Copy the full shape, start to finish. Every word is yours.', [1, 1, 1, 1], { opening: 1, order: 1, pace: 1, close: 1 }]];
    const paceOk = lenV === 'same' || lenV === undefined;
    const tkV = tk[mode]; const sw = (s.sw || {})[mode] || (tkV !== undefined ? TAKE[tkV][3] : {});
    const takes = TAKE.map((x, i) => { const dis = i > 0 && !paceOk; const on = tkV === i; return { t: x[0], d: x[1], dis, why: dis ? 'The pace doesn’t fit ' + lenLabel + '. Pick “Same as theirs” to use this.' : '', op: dis ? 0.4 : 1, pick: () => { if (!dis) set({ tk: Object.assign({}, tk, { [mode]: i }), sw: Object.assign({}, s.sw || {}, { [mode]: Object.assign({}, x[3]) }) }); }, bd: on ? '#FF5B7B' : 'rgba(255,255,255,0.08)', bg: on ? 'rgba(255,91,123,0.10)' : '#0E0E12', mark: on ? '✓' : '', dot: on ? '#FF5B7B' : 'transparent', ring: on ? '#FF5B7B' : 'rgba(255,255,255,0.25)', cnt: 'Copies ' + Object.keys(x[3]).length + ' of 4', segs: ['opening', 'proof', 'proof', 'question'].map((l, j) => ({ l, c: x[2][j] ? (j === 0 ? '#FFB347' : (j === 3 ? '#65E5D8' : '#FF5B7B')) : 'rgba(255,255,255,0.12)' })) }; });
    const swCount = Object.keys(sw).filter(k => sw[k]).length;
    const switches = SW.map((x, j) => { const on = !!sw[x[1]]; const pt = PARTS[j]; return { t: x[0], when: pt[1], theirs: pt[2], yours: on ? pt[3] : 'Yours, not copied', st: on ? 'Taking it' : 'Yours', stc: on ? '#8FEDE3' : '#8D8475', yc: on ? '#D8CFC2' : '#6E675C', on, knob: on ? '18px' : '2px', tbg: on ? '#65E5D8' : 'rgba(255,255,255,0.14)', tog: () => { if (on && swCount <= 1) { set(toast('Keep at least one thing to take.')); return; } const n = Object.assign({}, sw, { [x[1]]: !on }); set({ sw: Object.assign({}, s.sw || {}, { [mode]: n }), tk: Object.assign({}, tk, { [mode]: tkV === undefined ? 0 : tkV }) }); } }; });
    // ---------- idea
    const ir = this.ideaRead(s.txt); const ideaOk = !['empty', 'vague'].includes(ir);
    const IDEAS = [['From your account', [['Pricing your first bag of beans', 'A question in your comments'], ['Starting small vs waiting for money', 'A story you told Twin'], ['Why your batches stay tiny', 'Your most-saved topic']]], ['Happening now', [['National Coffee Day from a tiny roastery', 'Oct 1'], ['Gift bags for coffee people', 'Holiday season'], ['Cold mornings, hot drinks', 'This month']]], ['Working in your niche', [['Dark roast isn’t stronger', 'Working for coffee creators now'], ['What $500 starts a cart with', 'Money breakdowns are working'], ['A day at the roaster in 30 seconds', 'Day-in-the-life is working']]]];
    const isrc = s.isrc || 0;
    // ---------- requirements
    const miss = [];
    if (mode === 2) { if (!subj) miss.push('what it’s about'); if (!puName) miss.push('what it’s for'); }
    if (mode === 1 && !ideaOk) miss.push('your idea');
    if (mode === 0 && !refFound) miss.push('a video link');
    if (mode === 3 && gsel < 0) miss.push('a video');
    if (isRefLike && tkV === undefined) miss.push('what to take');
    if (lenV === undefined) miss.push('a length');
    const ready = miss.length === 0 && !s.out;
    let sumT = '';
    if (mode === 2) sumT = (A ? (A.kind === 'brand' ? 'A video about your business' : 'A video about ' + A.name) : 'A video') + (puName ? ', ' + puName.toLowerCase() : '') + (lenLabel ? ', ' + lenLabel : '') + '.';
    if (mode === 1) sumT = (ideaOk ? 'Your idea' : 'An idea') + (puName && puName !== 'Let Twin decide' ? ', ' + puName.toLowerCase() : '') + (A && A.kind !== 'none' ? ', mentioning ' + A.short : '') + (lenLabel ? ', ' + lenLabel : '') + '.';
    if (isRefLike) sumT = 'Borrowing from ' + refInfo.h + (tkV !== undefined ? ': ' + TAKE[tkV][0].toLowerCase() : '') + (A && A.kind !== 'none' ? ', mentioning ' + A.short : '') + (lenLabel ? ', ' + lenLabel : '') + '.';
    const lastFill = () => { const o = { ln: Object.assign({}, ln, { [mode]: isRefLike ? 'same' : 60 }) }; if (mode === 2) { o.sub = Object.assign({}, sub, { 2: 'o0' }); o.pu = Object.assign({}, pu, { 2: 'New or back in stock' }); } if (isRefLike) o.tk = Object.assign({}, tk, { [mode]: 0 }); set(Object.assign(o, toast('Filled from your last video. Change anything.'))); };
    // ---------- angles
    const angState = s.angState || 'default';
    const pn = puName || ''; const kindB = A && A.kind === 'brand';
    let ANG;
    if (mode === 1) ANG = [['TELL THE MOMENT', 'The month I almost quit', 'personal and warm', '“I almost gave up in my first month.”', 'from your story', ['your first-month story'], ['the moment you kept going'], 'Did something happen that made you keep going? What was it?', 'so the video has a real turning point.'], ['TAKE A STAND', 'You don’t need a fancy setup', 'bold', '', 'a question about your topic', ['your view'], ['your take, in your words'], 'Do you think people need a fancy setup to start? Why or why not?', 'so the video says what you really think.'], ['BEHIND THE SCENES', 'One step nobody sees', 'curious, honest', '', 'a question about your topic', [], ['one step you do'], 'What’s one step of your day nobody ever sees?', 'so there’s something real to show.']];
    else if (isRefLike) ANG = [['BUST A MYTH', 'The thing people get wrong about dark roast', 'confident, a little surprising', '“Dark roast isn’t stronger. It’s just roasted longer.”', 'from your story', ['your belief', 'their opening'], [], '', ''], ['ANSWER THE QUESTION', 'Which roast should you actually buy?', 'helpful and direct', '“Which roast should you actually buy?”', 'a question about your topic', ['their opening'], ['your answer'], 'When someone asks which roast to buy, what do you tell them?', 'so the answer is yours, not a guess.'], ['SHOW IT WORKING', 'Two bags, side by side', 'hands-on, proof', '', 'a look at the product', ['the product'], ['what you notice first'], 'What do you notice first when you open a fresh bag?', 'so the video shows something real.']];
    else if (kindB) ANG = [['TELL THE MOMENT', 'Why it started in a kitchen', 'personal and warm', '“This whole business started next to my stove.”', 'from your story', ['your start story'], [], '', ''], ['BUST A MYTH', 'What people get wrong about small roasters', 'confident, a little surprising', '“Small batch doesn’t mean inconsistent.”', 'from your line', ['your view'], [], '', ''], ['BEHIND THE SCENES', 'A step nobody sees', 'curious, honest', '', 'a question about your topic', [], ['one step you do'], 'What’s one step of roasting day nobody sees?', 'so there’s something real to show.']];
    else if (pn === 'Launch it') ANG = [['TELL THE MOMENT', 'Why I made it', 'personal and warm', '', 'a question about your topic', [], ['the moment behind it'], 'What made you decide to make this one?', 'so the launch has a real reason.'], ['MAKE THE OFFER', 'It’s here, and here’s who it’s for', 'clear and direct', '“It’s here, and it’s for people who brew at home.”', 'a plain line', ['price', 'sizes'], [], '', ''], ['SHOW IT WORKING', 'The first cup', 'hands-on, proof', '', 'a look at the product', ['the product'], ['what you notice first'], 'What do you notice first when you brew it?', 'so the video shows something real.']];
    else ANG = [['TELL THE MOMENT', 'What people said while it was gone', 'personal and warm', '“A customer messaged me every week asking when it was back.”', 'from your comment', ['a saved comment'], [], '', ''], ['MAKE THE OFFER', 'It’s back, in a small batch', 'clear and direct', '“It’s back, and this is the small batch.”', 'a plain line', ['price', 'sizes'], ['what’s new this time'], 'Is anything different this time, or exactly as before?', 'so the video doesn’t guess what changed.'], ['SHOW IT WORKING', 'What you notice when you open the bag', 'hands-on', '', 'a look at the product', ['the product'], ['what you notice first'], 'What do you notice first when you open a fresh bag?', 'so the video shows something real.']];
    if (angState === 'thin') ANG = ANG.filter(x => x[5].length === 0 || x[0] !== 'TELL THE MOMENT').slice(0, 2);
    if (angState === 'none') ANG = [['A SHORT, HONEST VIDEO', 'Just the facts you’ve confirmed', 'plain and clear', '', 'a plain line', ['confirmed facts'], ['what’s different this time'], 'What’s different about it this time?', 'so the video has more than the basics.']];
    if (s.noStory) { const f = ANG.filter(x => x[6].length === 0 && x[0] !== 'TELL THE MOMENT'); ANG = f.length ? f : ANG.filter(x => x[0] !== 'TELL THE MOMENT'); }
    const asel = s.asel === undefined ? -1 : Math.min(s.asel, ANG.length - 1);
    const ans = s.ans || {};
    const angles = ANG.map((x, i) => {
      const sel = i === asel; const answered = !!ans[i]; const needs = x[6].length > 0 && !answered;
      const forceNeeds = angState === 'needs' && i === 1;
      return {
        label: x[0], t: x[1], feel: x[2], op: x[3], hasOp: !!x[3], noOp: !x[3], opQ: 'The video opens with a question about ' + (mode === 1 ? 'starting out' : 'your coffee') + '.', src: x[4],
        uses: x[5].map(u => ({ u })), hasUses: x[5].length > 0, noUses: x[5].length === 0,
        needsList: (needs || forceNeeds ? (x[6].length ? x[6] : ['a moment from you']) : []).map(n => ({ n })), needsNone: !(needs || forceNeeds), needsAmber: forceNeeds,
        isPick: i === 0, sel, mark: sel ? '✓' : '', pick: () => set({ asel: i, rfP: Date.now() + 700 }),
        bd: sel ? '#FF5B7B' : 'rgba(255,255,255,0.09)', bg: sel ? 'rgba(255,91,123,0.07)' : '#111115', op2: asel >= 0 && !sel ? 0.55 : 1
      };
    });
    const SA = asel >= 0 ? ANG[asel] : null;
    const cBlock = A && (A.need || A.conflict);
    let panel = '';
    if (SA) { if (cBlock) panel = 'C'; else if (SA[6].length && !ans[asel] && !(s.skipQ || {})[asel]) panel = 'A'; else panel = 'B'; }
    if (s.panelForce && SA) panel = s.panelForce;
    const cauN = s.cauN || 0; const cauOn = panel === 'A' && s.cau === asel && asel >= 0;
    const cauV = s.cauVer !== undefined ? s.cauVer : (SA ? (SA[0] === 'TELL THE MOMENT' ? 1 : (SA[0] === 'A SHORT, HONEST VIDEO' ? 2 : 0)) : 0);
    const CAU = [['Without your story, this will be a general version', 'Twin will write a shorter video with no personal story, and say what’s missing.'], ['This kind of video needs your moment', 'Twin can only write the outline. You’d tell the key part in your own words on camera.'], ['Twin doesn’t have enough for this one yet', 'Add one line, or pick a different angle.']];
    const showCau = () => set({ cau: asel, cauN: cauN + 1, storyOpen: false });
    const goWrite = (gen) => set({ step: 'w2', w2n: 0, w2slow: false, w2fail: false, peek: false, w2notest: false, general: gen, outlineOnly: gen && cauV === 1, cau: -1, myDone: false });
    const STORIES = [['Your restock story', '“People kept asking me when it would be back. One woman asked every Friday.”'], ['Your first-month story', '“I almost gave up when the first batch burned.”']];
    const usingAll = [['From you', [['Your story', '“Someone told me my roast ruined other coffee for them.”'], ['Your price', '12 oz $18 · 5 lb $65'], ['Your line', '“Small batch doesn’t mean inconsistent.”'], ['Your restock story', '“One woman asked every Friday.”']]], ['Heard in your videos, needs your OK', [['Free shipping on the website', ''], ['Sells out in about a week', '']]]];
    const lo = s.lo || {}; const hv = s.hv || {};
    const usingMine = usingAll[0][1].map((x, j) => ({ t: x[0], q: x[1], out: !!lo[j], rm: () => set({ lo: Object.assign({}, lo, { [j]: !lo[j] }) }), rmT: lo[j] ? 'Put back' : '✕', tc: lo[j] ? '#6E675C' : '#F6F1E9', deco: lo[j] ? 'line-through' : 'none' }));
    const usingHeard = usingAll[1][1].map((x, j) => { const on = !!hv[j]; return { t: x[0], on, knob: on ? '18px' : '2px', tbg: on ? '#65E5D8' : 'rgba(255,255,255,0.14)', tog: () => set({ hv: Object.assign({}, hv, { [j]: !on }) }) }; });
    const usingN = usingMine.filter(x => !x.out).length + usingHeard.filter(x => x.on).length;
    const cConf = A && A.conflict; const cVal = s.cVal || ''; const cPick = s.cPick === undefined ? -1 : s.cPick;
    const cOk = cConf ? cPick >= 0 : cVal.trim().length > 3;
    const writeOk = panel !== 'C' || cOk;
    // ---------- W1 / W2
    const W1 = this.w1Steps(); const wt = s.wt || 0; const wn = Math.min(W1.length, Math.floor(wt / 3));
    const w1 = W1.map((x, i) => { const done = i < wn; const run = i === wn; return { t: x[0], r: done ? x[1] : (run ? 'Working…' : ''), ic: done ? '✓' : (run ? '' : '·'), spin: run && !s.w1slow, bg: done ? '#65E5D8' : (run ? 'rgba(255,91,123,0.18)' : 'rgba(255,255,255,0.06)'), fg: done ? '#0B0B0E' : '#B7AE9F', rc: done ? '#8FEDE3' : '#8D8475', tc: done || run ? '#F6F1E9' : '#6E675C' }; });
    const w1now = wn < W1.length ? W1[wn][0] : 'Almost there';
    const angT = SA ? SA[1] : 'your angle';
    const W2 = [['Planning the video around “' + angT + '”', 'Plan ready'], ['Writing the script', 'Draft written'], ['Checking nothing is made up', s.w2part ? 'Took out 1 line Twin couldn’t back up' : 'All lines come from what you’ve told Twin'], ['Testing the openings with the practice viewers', 'Opening 2 stopped 6 of 10'], ['Fixing weak lines', 'Fixed line 3'], ['Building your shots and teleprompter', '7 shots · teleprompter ready']];
    const w2n = s.w2n || 0; const w2i = Math.floor(w2n / 3);
    const w2 = W2.map((x, i) => { const done = i < w2i; const run = i === w2i; const fail = s.w2fail && run; return { t: x[0], r: fail ? 'Couldn’t finish this step.' : (done ? x[1] : (run ? (i === 3 ? 'Asking 10 practice viewers…' : 'Working…') : '')), ic: fail ? '!' : (done ? '✓' : (run ? '' : '·')), spin: run && !s.w2slow && !fail, bg: fail ? '#FFB347' : (done ? '#65E5D8' : (run ? 'rgba(255,91,123,0.18)' : 'rgba(255,255,255,0.06)')), fg: done || fail ? '#0B0B0E' : '#B7AE9F', rc: fail ? '#FFCB85' : (done ? '#8FEDE3' : '#8D8475'), tc: done || run ? '#F6F1E9' : '#6E675C' }; });
    const w2done = w2i >= W2.length;
    const vt = Math.max(0, Math.min(10, Math.round((w2n - 8) * 3.4)));
    const OPN = [['Opening 1', 0.4], ['Opening 2', 0.6]].map((x, i) => { const n = Math.round(x[1] * vt); return { k: x[0], n: n + ' of 10 would stop', w: n * 10 + '%', c: i === 1 ? '#65E5D8' : '#FF5B7B', best: i === 1 && vt >= 10 }; });
    const showAsk = w2n >= 12; const showFix = w2n >= 13 && !s.w2notest;
    // ---------- preview bar
    const go = (o) => () => set(Object.assign({ sheet: false, drawer: false, cau: -1, cauVer: undefined }, o));
    const pv = (t, on, f) => ({ t, f, bg: on ? '#F6F1E9' : 'transparent', fg: on ? '#0B0B0E' : '#8D8475' });
    const screens = [['1 Create', 's1'], ['Wait 1 · Reading', 'w1'], ['2 Angles', 'ang'], ['Wait 2 · Making', 'w2']].map(x => pv(x[0], step === x[1], go({ step: x[1], wt: 0, w2n: 0, w1slow: false })));
    let states = [];
    if (step === 's1') {
      states = [pv('Empty', false, go({ sub: Object.assign({}, sub, { [mode]: undefined }), pu: Object.assign({}, pu, { [mode]: undefined }), ln: Object.assign({}, ln, { [mode]: undefined }), tk: Object.assign({}, tk, { [mode]: undefined }), txt: mode === 1 ? '' : s.txt, refState: mode === 0 ? 'empty' : rs, galFrom: undefined, gsel: mode === 3 ? -1 : s.gsel })),
        pv('Ready', ready, go(Object.assign({ ln: Object.assign({}, ln, { [mode]: isRefLike ? 'same' : 60 }), tk: Object.assign({}, tk, { [mode]: 0 }) }, mode === 2 ? { sub: Object.assign({}, sub, { 2: 'o0' }), pu: Object.assign({}, pu, { 2: 'New or back in stock' }) } : {}, mode === 1 ? { txt: 'Our Signature Blend is back and people kept asking' } : {}, mode === 0 ? { refState: 'found' } : {}, mode === 3 ? { gsel: 0 } : {})))];
      if (mode === 2) states = states.concat([pv('Needs a price', subj === 'o1', go({ sub: Object.assign({}, sub, { 2: 'o1' }) })), pv('Add a product', !!s.addOpen, go({ addOpen: true })), pv('Edit what Twin knows', !!s.drawer, go({ drawer: true }))]);
      if (mode === 0) states = states.concat([pv('From the Gallery', gf >= 0 && rs === 'found', go({ galFrom: 4, refState: 'found' }))]).concat([['Reading', 'loading'], ['Found', 'found'], ['Private', 'private'], ['No speech', 'nospeech'], ['Not supported', 'unsupported'], ['Length doesn’t fit', 'long']].map(x => pv(x[0], rs === x[1], go({ refState: x[1], refN: 0, ln: x[1] === 'long' ? Object.assign({}, ln, { 0: 90 }) : ln }))).concat([pv('Edit what to take', !!s.swOpen, go({ swOpen: !s.swOpen, tk: Object.assign({}, tk, { 0: tkV === undefined ? 0 : tkV }), refState: refFound ? rs : 'found' }))]));
      if (mode === 1) states = states.concat([pv('Typing', ir === 'named', go({ txt: 'Our Signature Blend is back and people kept asking' })), pv('Two named', ir === 'two', go({ txt: 'Signature Blend vs the single origin, which one should you buy' })), pv('Not hers', ir === 'nothers', go({ txt: 'Why I switched to a Chemex for slow mornings' })), pv('Too short', ir === 'vague', go({ txt: 'coffee?' })), pv('Mic listening', !!s.mic, go({ mic: !s.mic }))]);
      states = states.concat([pv('Out of free videos', !!s.out, go({ out: !s.out }))]);
    }
    if (step === 'w1') states = [pv('Running', !s.w1slow, go({ step: 'w1', wt: 0, w1slow: false })), pv('Slow', !!s.w1slow, go({ step: 'w1', wt: 4, w1slow: true }))];
    if (step === 'ang') states = [['Default', 'default'], ['Loading', 'loading'], ['Refreshing', 'refresh'], ['Thin material', 'thin'], ['Needs a moment', 'needs'], ['None fit', 'none']].map(x => pv(x[0], angState === x[1] && !s.panelForce, go({ angState: x[1], asel: undefined, panelForce: '' }))).concat([pv('Panel A · question', panel === 'A' && !cauOn, go({ asel: 1, panelForce: 'A', angState: 'default' })), pv('Panel B · ready', panel === 'B', go({ asel: 0, panelForce: 'B', angState: 'default' })), pv('Panel C · before we start', panel === 'C', go({ asel: 0, panelForce: 'C', angState: 'default' })), pv('Skip · general', cauOn && cauV === 0 && cauN <= 1, go({ asel: 1, panelForce: 'A', angState: 'default', cau: 1, cauVer: 0, cauN: 1 })), pv('Skip · outline only', cauOn && cauV === 1 && cauN <= 1, go({ asel: 1, panelForce: 'A', angState: 'default', cau: 1, cauVer: 1, cauN: 1 })), pv('Skip · not enough', cauOn && cauV === 2, go({ asel: 1, panelForce: 'A', angState: 'default', cau: 1, cauVer: 2, cauN: 1 })), pv('Skip · one-line repeat', cauOn && cauN > 1, go({ asel: 1, panelForce: 'A', angState: 'default', cau: 1, cauVer: 0, cauN: 2 })), pv('No-story angles', !!s.noStory, go({ noStory: !s.noStory, asel: undefined, panelForce: '', cau: -1 }))]);
    if (step === 'w2') states = [pv('Running', !s.w2slow && !s.peek && !s.w2notest && w2n < 11, go({ step: 'w2', w2n: 0, w2slow: false, peek: false, w2notest: false, w2part: false, general: false })), pv('Viewers voting', w2i === 3, go({ w2n: 11, w2slow: false })), pv('Before/after fix', w2n >= 13 && w2n < 16, go({ w2n: 14 })), pv('Slow', !!s.w2slow, go({ w2slow: true, w2n: 5 })), pv('Draft peek', !!s.peek, go({ peek: true, w2n: 7 })), pv('Not tested by viewers', !!s.w2notest, go({ w2notest: true, w2n: 22, general: false })), pv('Done · general version', !!s.general && w2done && !s.myDone, go({ general: true, outlineOnly: false, myDone: false, w2n: 22, w2notest: false, peek: false }))];
    const recapParts = [A ? (A.kind === 'brand' ? 'Maya’s Coffee' : 'Maya’s Coffee · ' + A.short) : (isRefLike ? 'From ' + refInfo.h : (mode === 2 ? 'Maya’s Coffee · Signature Blend' : 'Your idea')), isRefLike ? (tkV !== undefined ? TAKE[tkV][0] : '') : (puName || (mode === 2 ? 'New or back in stock' : 'Twin decides')), lenLabel || (mode === 2 ? '60s' : '')].filter(Boolean);
    const backTo1 = (m) => () => set(Object.assign({ step: 's1' }, toast(m)));
    return {
      MOB, isS1: step === 's1', isW1: step === 'w1', isAng: step === 'ang', isW2: step === 'w2',
      screens, states, hasStates: states.length > 0,
      modes: [['M9 18V6l10 6z', 'A video I liked'], ['M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z', 'My own idea'], ['M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8', 'Brand or product'], ['M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', 'Pick from Gallery']].map((x, i) => ({ d: x[0], label: x[1], pick: () => set({ mode: i, sheet: false }), bg: i === mode ? 'linear-gradient(110deg,#FFB347,#FF5B7B 55%,#65E5D8)' : 'transparent', fg: i === mode ? '#0B0B0E' : '#B7AE9F' })),
      isRef: mode === 0, isIdea: mode === 1, isProd: mode === 2, isGal: mode === 3, isRefLike, notRefLike: !isRefLike,
      sub2: ['Paste a video that did well. Twin takes how it’s built. Every word is yours.', 'Say it however it comes out. A messy thought is plenty.', 'Pick what the video is about, what it’s for, and how long.', 'Pick a video doing well in your niche. Twin takes how it’s built.'][mode],
      // product row
      prodLabel: mode === 2 ? 'What’s it about?' : 'About a product?', prodOpt: mode !== 2, prodReq: mode === 2,
      ptBrand: [pchip('b')], ptOwn: ownK.map(pchip), ptOther: ['a0', 'a1'].map(pchip), ptNone: [pchip('none')], hasNone: mode !== 2, addOpen: !!s.addOpen, openAdd: () => set({ addOpen: true, addWho: s.addWho || 0 }), closeAdd: () => set({ addOpen: false }), saveAdd: () => set(Object.assign({ addOpen: false, added: true, sub: Object.assign({}, sub, { [mode]: 'n0' }) }, toast('Added Cold Brew Concentrate. Twin will ask for anything it needs.'))), addWho: [['It’s mine. I make or sell it.', 'Twin talks about it as yours.'], ['I promote it for someone else.', 'Twin says it’s a partnership in the video.']].map((x, i) => ({ t: x[0], d: x[1], pick: () => set({ addWho: i }), dot: (s.addWho || 0) === i ? '#FF5B7B' : 'transparent', ring: (s.addWho || 0) === i ? '#FF5B7B' : 'rgba(255,255,255,0.25)', bd: (s.addWho || 0) === i ? 'rgba(255,91,123,0.5)' : 'rgba(255,255,255,0.08)' })), addOther: (s.addWho || 0) === 1,
      sheet: !!s.sheet, closeSheet: () => set({ sheet: false }), sheetBrand: [prow('b')], sheetOwn: ['o0', 'o1', 'o2', 'o3'].map(prow), sheetOther: ['a0', 'a1'].map(prow), sheetNone: [prow('none')],
      openDrawer: () => set({ drawer: true, sheet: false }), drawer: !!s.drawer, closeDrawer: () => set({ drawer: false }), saveDrawer: () => set(Object.assign({ drawer: false }, toast('Saved. Twin knows more about ' + (A ? A.short : 'Signature Blend') + '.'))),
      dName: A && A.kind === 'own' ? A.name : 'Signature Blend Beans', dThumb: A ? A.thumb : P.o0.thumb,
      dFound: [['Roasted in small batches on Thursdays', 'You told Twin', true], ['Notes of cocoa and cherry', 'From your videos, not confirmed', true], ['Usually sells out in a week', 'From your videos, not confirmed', false]].map((x, i) => { const k = 'f' + i; const on = (s.df || {})[k] === undefined ? x[2] : s.df[k]; return { t: x[0], src: x[1], on, lab: on ? 'Use' : 'Don’t use', tog: () => set({ df: Object.assign({}, s.df || {}, { [k]: !on }) }), knob: on ? '18px' : '2px', tbg: on ? '#65E5D8' : 'rgba(255,255,255,0.14)' }; }),
      dConfs: ['Colombia, Huila', 'Brazil, Cerrado'].map((t, i) => ({ t, pick: () => set({ cPick: i }), dot: i === cPick ? '#FF5B7B' : 'transparent', bd: i === cPick ? '#FF5B7B' : 'rgba(255,255,255,0.25)', note: cPick >= 0 && i !== cPick ? 'Out of date' : '' })),
      // options / length
      opts, hasOpts: curOpts.length > 0, optReq: mode === 2, optLabel: 'What’s it for?', optNote: mode === 2 && !subj ? 'Pick what it’s about first and the right options show here.' : '', hasOptNote: mode === 2 && !subj,
      lens, lenLabel,
      // summary
      sumT, missT: miss.length ? 'Still needed: ' + miss.join(', ') : '✓ Everything’s set', missC: miss.length ? '#FFCB85' : '#8FEDE3', ready, btnOp: ready ? 1 : 0.4, btnCur: ready ? 'pointer' : 'not-allowed',
      cont: () => { if (!ready) { set(toast('Still needed: ' + miss.join(', '))); return; } set({ step: 'w1', wt: 0, asel: undefined, ans: {}, panelForce: '', skipQ: {} }); },
      lastFill, out: !!s.out,
      // ref
      refEmpty: mode === 0 && rs === 'empty', refShowRest: mode === 3 ? gsel >= 0 : refRead, refLoading: mode === 0 && rs === 'loading', refFound, refErr: mode === 0 && !!refErr, refErrT: refErr ? refErr[0] : '', refErrD: refErr ? refErr[1] : '', refLong: mode === 0 && rs === 'long', refNiche: rs === 'niche',
      paste: () => set({ refState: 'loading', refN: 0, galFrom: undefined }), toGallery: () => set({ mode: 3 }), refInput: rs === 'empty' ? '' : (gf >= 0 ? 'tiktok.com/' + GF[1] + '/video/7398…' : 'tiktok.com/@brewbyjo/video/7421…'), fromGal: mode === 0 && gf >= 0 && rs !== 'empty', backGal: () => set({ mode: 3 }),
      refInfo, readSteps, dim: refFound ? 1 : 0.35, dimPe: refFound ? 'auto' : 'none',
      takes, hasTake: tkV !== undefined, noTake: tkV === undefined, swOpen: !!s.swOpen, togSw: () => set({ swOpen: !s.swOpen }), switches,
      gvids: GV.map((x, i) => ({ t: x[0], h: x[1], v: x[2], cls: x[3], badge: x[4], bc: x[5], pick: () => set(Object.assign({ mode: 0, galFrom: i, gsel: i, refState: 'found', refN: 0 }, toast('Loaded “' + x[0] + '”. Pick what to take.'))), bd: i === gsel ? '#FF5B7B' : 'transparent', mark: i === gsel ? '✓' : '', chk: i === gsel ? '#FF5B7B' : 'rgba(0,0,0,0.45)' })),
      gtabs: ['Your niche', 'Close niches', 'Saved'].map((t, i) => ({ t, pick: () => set({ gtab: i }), bg: i === (s.gtab || 0) ? '#F6F1E9' : 'transparent', fg: i === (s.gtab || 0) ? '#0B0B0E' : '#B7AE9F' })), gPicked: gsel >= 0, gNone: gsel < 0,
      // idea
      txt: s.txt || '', typed: (e) => set({ txt: e.target.value }), ideaVague: ir === 'vague', irTwo: ir === 'two' && !subj, irNot: ir === 'nothers' && !subj, irNamed: ir === 'named' && !subj,
      guessNamed: () => set({ sub: Object.assign({}, sub, { 1: 'o0' }) }),
      twoChips: [['o0', 'Signature Blend Beans'], ['o1', 'Single-Origin Limited Release'], ['none', 'Neither']].map(x => ({ t: x[1], pick: () => set({ sub: Object.assign({}, sub, { 1: x[0] }) }) })),
      asRec: () => set(Object.assign({ sub: Object.assign({}, sub, { 1: 'a0' }) }, toast('Written as a recommendation. Twin will say how you know it.'))), asNone: () => set({ sub: Object.assign({}, sub, { 1: 'none' }) }),
      mic: !!s.mic, togMic: () => set({ mic: !s.mic, txt: !s.mic && !s.txt ? 'people keep asking how I started the cart, and honestly it was' : s.txt }),
      ideaTabs: IDEAS.map((x, i) => ({ t: x[0], pick: () => set({ isrc: i }), bg: i === isrc ? '#F6F1E9' : 'transparent', fg: i === isrc ? '#0B0B0E' : '#B7AE9F' })),
      ideaCards: IDEAS[isrc][1].map(x => ({ t: x[0], why: x[1], use: () => set({ txt: x[0] }) })),
      // W1
      w1, w1slow: !!s.w1slow, w1pct: Math.min(99, Math.round(wt / (W1.length * 3) * 100)) + '%', w1bar: Math.min(99, Math.round(wt / (W1.length * 3) * 100)) + '%', w1now,
      keepWaiting: () => set({ w1slow: false, w2slow: false }), retry: () => set({ wt: 0, w1slow: false, w2n: 0, w2slow: false, w2fail: false }), back: () => set({ step: 's1' }),
      // angles
      recap: recapParts.map((t, i) => ({ t, dot: i > 0 })), chProd: backTo1('Change what it’s about, then Continue'), chFor: backTo1('Change what it’s for, then Continue'), chLen: backTo1('Change the length, then Continue'),
      angles, angLoading: angState === 'loading', angNotLoading: angState !== 'loading', shim: (angState === 'refresh' || !!s.rfT) ? 'cfshim' : '',
      thin: angState === 'thin', noneFit: angState === 'none', letPick: () => set({ asel: 0, rfP: Date.now() + 700 }), hasSel: asel >= 0, noSel: asel < 0, arrowL: ['130px', '434px', '740px'][asel] || '130px',
      panelA: panel === 'A', panelB: panel === 'B', panelC: panel === 'C',
      q: SA ? (SA[7] || 'Is there anything you want Twin to know first?') : '', qWhy: SA ? (SA[8] || 'so the video doesn’t guess.') : '',
      storyOpen: !!s.storyOpen, togStory: () => set({ storyOpen: !s.storyOpen }),
      stories: STORIES.map(x => ({ t: x[0], q: x[1], use: () => set(Object.assign({ ans: Object.assign({}, ans, { [asel]: x[1] }), storyOpen: false, panelForce: '' }, toast('Using ' + x[0].toLowerCase()))) })),
      ansDraft: s.ansDraft || '', typedAns: (e) => set({ ansDraft: e.target.value }), sendAns: () => { if ((s.ansDraft || '').trim()) set(Object.assign({ ans: Object.assign({}, ans, { [asel]: s.ansDraft.trim() }), ansDraft: '', panelForce: '' }, toast('Saved. This angle has what it needs.'))); },
      nothing: () => set(Object.assign({ ans: Object.assign({}, ans, { [asel]: 'Nothing like that happened' }), panelForce: '' }, toast('Got it. Twin won’t ask again or make anything up.'))),
      skipQ: showCau,
      cauOn, noCau: !cauOn, cauFull: cauOn && cauN <= 1, cauLine: cauOn && cauN > 1, cauH: CAU[cauV][0], cauB: CAU[cauV][1], cauCanWrite: cauV !== 2, cauWriteT: cauV === 1 ? 'Write the outline' : 'Write the general one', cauAngle: SA ? SA[0].charAt(0) + SA[0].slice(1).toLowerCase() : '',
      cauAdd: () => set({ cau: -1 }), cauPickNo: () => set(Object.assign({ noStory: true, cau: -1, asel: undefined, panelForce: '', rfP: Date.now() + 700 }, toast('Showing angles that need no personal story.'))), cauWrite: () => goWrite(true),
      noStoryOn: !!s.noStory && step === 'ang', showAllAng: () => set({ noStory: false, asel: undefined }),
      skipped: !!(s.skipQ || {})[asel], ansT: SA && ans[asel] ? ans[asel] : '', hasAns: SA ? !!ans[asel] : false,
      usingMine, usingHeard, usingN: 'Using: ' + usingN + ' things', usingOpen: !!s.uOpen, togUsing: () => set({ uOpen: !s.uOpen }), usingLbl: s.uOpen ? 'Hide' : 'See all',
      cProd: A && A.kind === 'own' ? A.name : 'this product', cConf: !!cConf, cNeed: !cConf, cVal, typedC: (e) => set({ cVal: e.target.value }), toBusiness: () => set(Object.assign({ sub: Object.assign({}, sub, { [mode]: 'b' }), pu: Object.assign({}, pu, { [mode]: undefined }), step: 's1' }, toast('Switched to your business. Pick what it’s for.'))),
      writeOp: writeOk ? 1 : 0.4, writeCur: writeOk ? 'pointer' : 'not-allowed', unansNote: panel === 'A' ? 'If you write it now, that counts as Skip. Twin will write a shorter script and say what’s left out.' : '',
      write: () => { if (!writeOk) return; if (panel === 'A' && !(s.skipQ || {})[asel]) { showCau(); return; } set({ general: false,  step: 'w2', w2n: 0, w2slow: false, w2fail: false, peek: false, w2notest: false }); },
      // W2
      w2, w2done, w2running: !w2done && !s.w2fail, w2slow: !!s.w2slow, w2pct: Math.min(100, Math.round(w2n / 18 * 100)) + '%', w2now: w2done ? 'Done' : (W2[Math.min(w2i, W2.length - 1)] || [''])[0],
      openings: OPN, votesT: vt + ' of 10 voted', showAsk, showFix, notTested: !!s.w2notest && w2done, genDone: w2done && !!s.general && !s.myDone, genH: s.outlineOnly ? 'Outline only: you tell the key part on camera.' : 'General version: no personal story. Add a moment to make it yours.', myDraft: s.myDraft || '', typedMy: (e) => set({ myDraft: e.target.value }), sendMy: () => set(Object.assign({ myDone: true, myDraft: '', w2n: 0, step: 'w2' }, toast('Re-writing the same video with your moment.'))), myOpen: !!s.myOpen, togMy: () => set({ myOpen: !s.myOpen }), myStories: [['Your restock story', '“One woman asked every Friday.”'], ['Your first-month story', '“I almost gave up when the first batch burned.”']].map(x => ({ t: x[0], q: x[1], use: () => set(Object.assign({ myDone: true, w2n: 0, myOpen: false }, toast('Re-writing with ' + x[0].toLowerCase() + '.'))) })),
      peek: !!s.peek, doPeek: () => set({ peek: true }), unpeek: () => set({ peek: false }), stopKeep: () => set(Object.assign({ step: 'ang' }, toast('Stopped. Your answers are saved.'))),
      groups: [['Buyers', 4], ['The curious', 3], ['Skeptics', 2], ['Fellow makers', 1]].map(x => ({ t: x[0], n: x[1] })),
      toast: s.toast || '', hasToast: !!s.toast
    };
  }
}
