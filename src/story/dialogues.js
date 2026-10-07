// حوارات متفرعة باللهجة الشامية — محتوى أصلي للعبة.
// صيغة العقدة:
//   { who, expr, text|[text...], fx, choices:[{t, say?, next, cond, lock, once, fx}], next, end }
//   next قد تكون دالة (story)=>id. cond/lock: دالة (story)=>bool + نص يظهر عند القفل.
// تُستبدل الأصوات بتسجيلات عبر voiceId (لكل سطر مفتاح اختياري `v`).

const NAD = 'nadim';

export const DIALOGUES = {
  // ═══════════════ أبو جلال — صاحب المقهى ═══════════════
  abuJalal: {
    entry: (s) => {
      if (s.ending) return 'aj_post_' + s.ending;
      if (!s.flag('met_aj')) return 'aj_intro';
      if (s.hasItem('watch')) return 'aj_resolve';
      return 'aj_hub';
    },
    nodes: {
      aj_intro: {
        who: 'abuJalal', expr: 'worried',
        text: 'يا هلا بنديم! الله يعطيك العافية… تعا لهون يا ابني، بدي منك خدمة، وبدي ياها بيني وبينك.',
        fx: { flag: { met_aj: true }, event: 'questStart' },
        next: 'aj_intro2',
      },
      aj_intro2: {
        who: 'abuJalal', expr: 'worried',
        text: 'ساعة الجيب يلي ورّثني ياها أبوي، الله يرحمو… اختفت هالصبح من على الطاولة الورانية. فتّشت المقهى كلو، ولا أثر!',
        next: (s) => (s.hasItem('watch') ? 'aj_resolve' : 'aj_hub'),
      },
      aj_hub: {
        who: 'abuJalal', expr: 'worried',
        text: 'شو بتحب تسأل يا نديم؟ والله قلبي مو مرتاح.',
        choices: [
          { t: 'مين كان قاعد بالمقهى هالصبح؟', once: 'ajwho', next: 'aj_who' },
          { t: 'احكيلي شو صار عالطاولة بالضبط.', once: 'ajtable', next: 'aj_table' },
          { t: 'لقيت هالسلسلة تحت الطاولة يا أبو جلال…', once: 'ajchain', cond: (s) => s.hasItem('chain') || s.hasClue('c_chain'), next: 'aj_chain' },
          { t: 'طمّن بالك… بلاقيها من دون فضيحة.', once: 'ajdisc', next: 'aj_disc', fx: { trust: { abuJalal: 10 }, flag: { discreet: true }, rep: { amana: 2 }, log: 'وعدتَ أبا جلال بالكتمان.' } },
          { t: 'الأحسن نخبر العكيد، هو بيعرف يتصرف.', once: 'ajtell', next: 'aj_tell', fx: { trust: { abuJalal: -5 }, flag: { told_aqeed: true }, rep: { haiba: 1 }, log: 'نصحتَ بإخبار العكيد بالأمر.' } },
          { t: 'ماشي… رح دوّر.', end: true, say: 'ماشي يا أبو جلال، رح دوّر وبرجعلك بالخبر.' },
        ],
      },
      aj_who: {
        who: 'abuJalal', expr: 'thinking',
        text: 'هالصبح؟ كان في ناس كتير… أم حسن مرّقت تجيب خبز، وولدها حسن كان عم يلعب حدّ المقهى. وكان في بياع جوّال قاعد يرتاح عالدرج، بياع خرز وشرايط، ما بعرفو.',
        fx: { clue: 'c_witnesses' }, next: 'aj_hub',
      },
      aj_table: {
        who: 'abuJalal', expr: 'thinking',
        text: 'حطيتها عالطاولة الورانية وقت ما فتّ أجيب الشاي. لما رجعت… خلص، ما عاد في ساعة. وما حسّيت بحدا مرق.',
        next: 'aj_hub',
      },
      aj_chain: {
        who: 'abuJalal', expr: 'surprised',
        text: 'سلسلة ساعتي! يا ويلي… يعني انسرقت، ما ضاعت! بس مين بدو يعمل هيك بالمقهى؟',
        fx: { flag: { aj_knows_chain: true }, trust: { abuJalal: 3 } }, next: 'aj_hub',
      },
      aj_disc: {
        who: 'abuJalal', expr: 'smile',
        text: 'الله يخليك! لو عرف العكيد بيقلب الحارة وبيتهم ناس أبرياء. إنت ابن حلال يا نديم.',
        next: 'aj_hub',
      },
      aj_tell: {
        who: 'abuJalal', expr: 'worried',
        text: 'أنا كنت خايف من هالشي… بس معك حق، يمكن لازم. بس بالعقل يا ابني، بالعقل.',
        next: 'aj_hub',
      },
      // ─── عند إيجاد الساعة ───
      aj_resolve: {
        who: 'abuJalal', expr: 'surprised',
        text: ['نديم؟! شو هاد؟ ساعة أبوي؟! لقيتها؟! الحمد لله!', 'احكيلي… وين كانت، ومين أخدها؟'],
        choices: [
          { t: 'ضاعت وانلقت يا أبو جلال. القصة خلصت، وما في داعي نعرف مين.', next: 'aj_end_sitr', fx: { log: 'اخترتَ الستر وأخفيتَ اسم الولد.' } },
          { t: 'حسن أخدها بدون قصد… خاف وخبّاها. بترجاك سامحو.', next: 'aj_forgive', fx: { log: 'صدقتَ القول وطلبتَ العفو للولد.' } },
          { t: 'حسن هو يلي أخدها. خلّي العكيد يأدّبو.', next: 'aj_end_hiba', fx: { log: 'سلّمتَ اسم الولد للعكيد.' } },
          { t: 'كانت مع البياع الجوّال… خلّي العكيد يحاسبو.', cond: (s) => s.flag('agreed_peddler') && !s.flag('peddler_released'), next: 'aj_end_zulm', fx: { log: 'ادّعيتَ أن الساعة وُجدت مع البائع.' } },
        ],
      },
      aj_forgive: {
        who: 'abuJalal', expr: 'thinking',
        text: 'حسن؟ ولد صغير… (يتنهد) …',
        next: (s) => (s.trust('abuJalal') >= 55 ? 'aj_forgive_yes' : 'aj_forgive_no'),
      },
      aj_forgive_yes: {
        who: 'abuJalal', expr: 'smile',
        text: 'الله يسامحو. ما بدي ولد يتأذى كرمال ساعة. إنت عمرك ما كذبت عليّ يا نديم… خلص، سامحتو.',
        next: 'aj_end_afw',
      },
      aj_forgive_no: {
        who: 'abuJalal', expr: 'angry',
        text: 'الأمانة غالية يا نديم، والولد لازم يتعلم. بدي العكيد يعرف، هيك بيتعلم ولا بيعيدها.',
        choices: [
          { t: 'طيب… إنت صاحب الشأن.', next: 'aj_end_hiba' },
          { t: 'خلّي العكيد يتوسط… هو بيسمع كلمتو.', cond: (s) => s.trust('aqeed') >= 50, lock: 'يحتاج ثقة العكيد (50+)', next: 'aj_end_afw_aq', fx: { log: 'استعنتَ بالعكيد ليتوسط للولد.' } },
        ],
      },
      aj_end_sitr: {
        who: 'abuJalal', expr: 'smile',
        text: 'الله يرضى عليك… رجّعت لي بخت أبوي. وسرّك بقلبي يا نديم.',
        fx: { ending: 'sitr' }, end: true,
      },
      aj_end_afw: {
        who: 'abuJalal', expr: 'smile',
        text: 'جيب الولد لعندي بعد المغرب، بدي قلو كلمتين… بس بالمحبة.',
        fx: { ending: 'afw' }, end: true,
      },
      aj_end_afw_aq: {
        who: 'abuJalal', expr: 'neutral',
        text: 'إذا العكيد بيقبل يتوسط، ما بدي أكتر. بسامحو… بس لا تنساها يا حسن.',
        fx: { ending: 'afw' }, end: true,
      },
      aj_end_hiba: {
        who: 'abuJalal', expr: 'sad',
        text: 'يعني هيك… طيب. خلّي العكيد يعرف. الله يسامحنا كلنا.',
        fx: { ending: 'hiba' }, end: true,
      },
      aj_end_zulm: {
        who: 'abuJalal', expr: 'angry',
        text: 'البياع؟! أنا حاسس من الأول! خلّي العكيد يحاسبو، الغريب ما إلو أمان.',
        fx: { ending: 'zulm' }, end: true,
      },
      aj_post_sitr: { who: 'abuJalal', expr: 'smile', text: 'الساعة رجعت عجيبها، وسرّ الأمور بقلبك. الله يخليك يا نديم.', end: true },
      aj_post_afw: { who: 'abuJalal', expr: 'smile', text: 'قعد حسن عندي بعد المغرب يشرب شاي… وولد بيتعلم أحسن من ألف عقاب.', end: true },
      aj_post_hiba: { who: 'abuJalal', expr: 'sad', text: 'ساعتي رجعت… بس ما عاد لها نفس الدقّ. الله يسامحنا.', end: true },
      aj_post_zulm: { who: 'abuJalal', expr: 'neutral', text: 'تسلم يا نديم. بس أحياناً بحس إنو الصبح كان أبسط من هيك…', end: true },
    },
  },

  // ═══════════════ العكيد — حامي الحارة ═══════════════
  aqeed: {
    entry: (s) => {
      if (s.ending) return 'aq_post_' + s.ending;
      if (!s.flag('met_aq')) return 'aq_intro';
      return 'aq_hub';
    },
    nodes: {
      aq_intro: {
        who: 'aqeed', expr: 'neutral',
        text: 'السلام عليكم يا نديم. الحارة هادية اليوم، الحمد لله… ودايماً هيك طالما عيني عليها.',
        fx: { flag: { met_aq: true } }, next: 'aq_hub',
      },
      aq_hub: {
        who: 'aqeed', expr: 'neutral',
        text: 'تفضل، شو بدك؟',
        choices: [
          { t: 'ضاعت ساعة أبو جلال… ما لاحظت شي مريب؟', once: 'aqq1', cond: (s) => s.flag('met_aj'), next: 'aq_peddler' },
          { t: 'كيف الحارة اليوم يا عكيد؟', once: 'aqsmall', next: 'aq_small' },
          { t: '(بالدليل) البياع ما إلو علاقة… شوف هالسلسلة وآثار الأقدام.', once: 'aqevid', cond: (s) => s.hasClue('c_chain') && s.hasClue('c_prints') && s.flag('heard_peddler'), lock: 'تحتاج السلسلة وآثار الأقدام', next: 'aq_evidence' },
          { t: 'طلّق البياع يا عكيد، ما في ولا دليل عليه.', once: 'aqfree', cond: (s) => s.flag('peddler_detained') && !s.flag('peddler_released'), next: (s) => (s.trust('aqeed') >= 55 ? 'aq_free_yes' : 'aq_free_no') },
          { t: 'سلامتك يا عكيد.', end: true, say: 'سلامتك يا عكيد، الله يعطيك العافية.' },
        ],
      },
      aq_peddler: {
        who: 'aqeed', expr: 'suspicious',
        text: 'البياع الجوّال! كان قاعد حدّ المقهى هالصبح وعيونو بكل مكان، وبعدين صار على الدرج. أنا بقول نوقّفو عند البوابة ونفتّشو.',
        fx: { clue: 'c_peddler', flag: { heard_peddler: true } },
        choices: [
          { t: 'معك حق يا عكيد، فتّشو.', next: 'aq_agree', fx: { trust: { aqeed: 10 }, flag: { agreed_peddler: true, peddler_detained: true }, rep: { haiba: 3, amana: -3 }, log: 'وافقتَ على توقيف البائع الجوّال.', event: 'detainPeddler' } },
          { t: 'استنى يا عكيد، ما في دليل… ما منظلم حدا.', next: 'aq_proof', fx: { trust: { aqeed: -5 }, flag: { defended_peddler: true }, rep: { amana: 3 }, log: 'دافعتَ عن البائع وطلبتَ الدليل.' } },
          { t: 'خلّيني دوّر أول، وبرجعلك بالجواب.', next: 'aq_wait', fx: { flag: { asked_time: true }, log: 'طلبتَ مهلة من العكيد.' } },
        ],
      },
      aq_agree: {
        who: 'aqeed', expr: 'smile',
        text: 'هيك بيحكي الزلمة! رح أخلّي الشباب يمسكوه. وإنت دوّر عالساعة وجيبها قبل ما نخسر وقت.',
        next: 'aq_hub',
      },
      aq_proof: {
        who: 'aqeed', expr: 'angry',
        text: 'ما إلك دخل بشغلي يا نديم… بس معك حق بنقطة: ما في دليل. قبل المغرب بدي جواب، وإلا بتصرّف أنا.',
        fx: { flag: { deadline_known: true } }, next: 'aq_hub',
      },
      aq_wait: {
        who: 'aqeed', expr: 'neutral',
        text: 'طيب… بس قبل المغرب بدي جواب. بعد هيك بتصرّف أنا، والحارة ما بتنتظر.',
        fx: { flag: { deadline_known: true } }, next: 'aq_hub',
      },
      aq_small: {
        who: 'aqeed', expr: 'neutral',
        text: (s) => {
          if (s.rep('haiba') >= 3) return 'اسمك صار مسموع بالحارة يا نديم. الناس بتحسب لكلمتك حساب.';
          if (s.rep('amana') >= 3) return 'بتمشي عالأصول… وهاد بيعجبني. بس لا تخلّي الطيبة تضحك عليك.';
          return 'الحارة بخير طالما كل واحد عارف حدّو. وإنت ولد حارة، ما رح أكتر عليك.';
        },
        next: 'aq_hub',
      },
      aq_evidence: {
        who: 'aqeed', expr: 'thinking',
        text: '(يفحص السلسلة بإبهامه)… بصمة صغيرة… وآثار ولد، مو رجّال.',
        fx: { rep: { amana: 3 }, flag: { peddler_released: true, peddler_detained: false }, log: 'أثبتَ براءة البائع أمام العكيد.', event: 'releasePeddler' },
        next: (s) => (s.trust('aqeed') >= 45 ? 'aq_evidence_ok' : 'aq_evidence_harsh'),
      },
      aq_evidence_ok: {
        who: 'aqeed', expr: 'neutral',
        text: 'معك حق… استعجلت. أنا ما برجع عن كلمتي بسهولة، بس الحق حق. رح أطلّقو وأعتذر منو.',
        fx: { trust: { aqeed: 8 } }, next: 'aq_hub',
      },
      aq_evidence_harsh: {
        who: 'aqeed', expr: 'angry',
        text: 'لا تعلّمني شغلي! … بس منيح، الدليل بيحكي. رح أطلّق البياع، وهاد منّي مو منّك.',
        fx: { trust: { aqeed: -4 } }, next: 'aq_hub',
      },
      aq_free_yes: {
        who: 'aqeed', expr: 'neutral',
        text: 'إنت عمرك ما غلطت معي يا نديم. بكلمتك بطلّقو… بس إذا بان إنو غلط، المسؤولية عليك.',
        fx: { flag: { peddler_released: true, peddler_detained: false }, trust: { aqeed: -2 }, log: 'أقنعتَ العكيد بإطلاق البائع بدون دليل.', event: 'releasePeddler' }, next: 'aq_hub',
      },
      aq_free_no: {
        who: 'aqeed', expr: 'angry',
        text: 'كلمتك ما بتكفي يا نديم! جيب لي دليل يفرّق، وبطلّقو. غير هيك… لأ.',
        next: 'aq_hub',
      },
      aq_post_sitr: { who: 'aqeed', expr: 'neutral', text: 'سمعت إنو الأمور انتهت بهدوء. كان بدّي أعرف التفاصيل… بس الحارة هادية، وهاد المهم.', end: true },
      aq_post_afw: { who: 'aqeed', expr: 'neutral', text: 'العفو عند المقدرة… بتشرّف يا نديم. بس مرة تانية، لا تخلّي الأمور توصل لهون.', end: true },
      aq_post_hiba: { who: 'aqeed', expr: 'smile', text: 'عرفت إنك رجّال تعتمد عليه. الحارة بتحتاج ناس متلك.', end: true },
      aq_post_zulm: { who: 'aqeed', expr: 'smile', text: 'شفت؟ حدسي ما بيخيب. الغريب غريب… الله يوفقك يا نديم.', end: true },
    },
  },

  // ═══════════════ أم حسن — الجارة ═══════════════
  umHasan: {
    entry: (s) => {
      if (s.ending) return 'um_post_' + s.ending;
      if (!s.flag('met_um')) return 'um_intro';
      if (s.flag('um_hostile') && !s.flag('um_apologized')) return 'um_cold';
      return 'um_hub';
    },
    nodes: {
      um_intro: {
        who: 'umHasan', expr: 'worried',
        text: 'أهلين يا نديم، الله يعطيك العافية. مو وقتك هلق يا ابني، عندي شغل ورا ظهري.',
        fx: { flag: { met_um: true } }, next: 'um_hub',
      },
      um_hub: {
        who: 'umHasan', expr: 'neutral',
        text: 'خير يا نديم؟',
        choices: [
          { t: 'أم حسن، ضاعت ساعة أبو جلال… شفتي شي هالصبح؟', once: 'umq1', cond: (s) => s.flag('met_aj') && !s.flag('um_confessed'), next: 'um_deny' },
          { t: 'كيف حسن؟ طمنيني عنو.', cond: (s) => s.flag('um_confessed'), next: 'um_hasan_talk' },
          { t: 'تسلميلي… بدي أحكي معك بعدين.', end: true, say: 'تسلميلي يا أم حسن، بحكي معك بعدين.' },
        ],
      },
      um_cold: {
        who: 'umHasan', expr: 'angry',
        text: 'ما عندي شي أقولو لك يا نديم. عيب يلي حكيتو.',
        choices: [
          { t: 'سامحيني يا أم حسن… ما كان قصدي أحرجك.', once: 'umapol', next: 'um_apology', fx: { trust: { umHasan: 8 }, flag: { um_apologized: true }, log: 'اعتذرتَ لأم حسن بعد أن ضغطتَ عليها.' } },
          { t: 'ما في مشكلة… سلامتك.', end: true },
        ],
      },
      um_apology: {
        who: 'umHasan', expr: 'neutral',
        text: 'الله يسامحك. الواحد وقت الخوف ما بيعرف شو بيحكي. تعا… اسأل يلي بدك.',
        next: 'um_hub',
      },
      um_deny: {
        who: 'umHasan', expr: 'worried',
        text: 'أنا؟! لا والله ما شفت شي! أنا جبت الخبز ورجعت عالبيت على طول.',
        choices: [
          { t: '(بضغط) ما بصدّقك… شفتك مارقة حدّ المقهى ومعك حسن.', next: 'um_pressure', fx: { trust: { umHasan: -15 }, flag: { um_hostile: true }, rep: { haiba: 1 }, log: 'ضغطتَ على أم حسن لتعترف.' } },
          { t: '(بلطف) ما جيت أحاسب حدا يا أم حسن… خايف حدا يتأذى بالظلم. الأولاد بيغلطوا، وبنفهمهم.', next: (s) => (s.trust('umHasan') >= 40 ? 'um_confess' : 'um_guarded'), fx: { trust: { umHasan: 15 }, rep: { amana: 2 }, log: 'عاملتَ أم حسن بلطف.' } },
          { t: '(بالدليل) هاي سلسلة الساعة… وعليها بصمة إيد صغيرة.', cond: (s) => s.hasItem('chain'), lock: 'تحتاج السلسلة', next: 'um_evidence', fx: { trust: { umHasan: -3 }, log: 'واجهتَ أم حسن بالسلسلة.' } },
          { t: 'ولا شي… سلامتك.', end: true },
        ],
      },
      um_pressure: {
        who: 'umHasan', expr: 'angry',
        text: 'عيب عليك يا نديم! ولدي ما بيسرق! تفضل… عندي شغل.',
        end: true,
      },
      um_guarded: {
        who: 'umHasan', expr: 'suspicious',
        text: 'ما بعرف شو بدك مني يا نديم… ما عندي شي أقولو. بس شكراً على الكلمة الحلوة.',
        next: 'um_hub',
      },
      um_evidence: {
        who: 'umHasan', expr: 'sad',
        text: '(بعيون دامعة) يا ويلي… ما كان قصدو يا نديم، والله ما كان قصدو!',
        fx: { trust: { umHasan: -2 } }, next: 'um_confess',
      },
      um_confess: {
        who: 'umHasan', expr: 'sad',
        text: ['حسن رجع مبارح الصبح مبلول وخايف. قال إنو شاف شي بيلمع عالطاولة وحبّ يشوف كيف بيدقّ. وما قال لي وين خبّاه.', 'بس بعرف ولدي… كل شي بيخبّيه بالمصطبة الحجر، حدّ البحرة.'],
        fx: { clue: 'c_hint', flag: { um_confessed: true } }, next: 'um_beg',
      },
      um_beg: {
        who: 'umHasan', expr: 'worried',
        text: 'بترجاك يا نديم… لا تفضحو. هو ولد صغير.',
        choices: [
          { t: 'ما تخافي يا أم حسن… الأمر رح يمرّ بهدوء.', next: 'um_thanks', fx: { trust: { umHasan: 8 }, flag: { promised_um: true }, rep: { amana: 2 }, log: 'وعدتَ أم حسن بأن يُحفظ الولد.' } },
          { t: 'ما بوعدك بشي… بس رح أشوف شو الأحسن.', next: 'um_neutral_end', fx: { log: 'لم تَعِد أم حسن بشيء.' } },
        ],
      },
      um_thanks: {
        who: 'umHasan', expr: 'smile',
        text: 'الله يخليك ويحفظك يا نديم. هيك الرجال.',
        end: true,
      },
      um_neutral_end: {
        who: 'umHasan', expr: 'sad',
        text: 'الله يهديك… وإحنا على الله.',
        end: true,
      },
      um_hasan_talk: {
        who: 'umHasan', expr: 'sad',
        text: 'حسن قاعد جوّا، ما بدو يطلع من الخوف. ما أكل شي من الصبح.',
        next: 'um_hub',
      },
      um_post_sitr: { who: 'umHasan', expr: 'smile', text: 'ما بنسى معروفك يا نديم. بيتي بيتك، وحسن بيقلك «مرحبا» كل ما شافك.', end: true },
      um_post_afw: { who: 'umHasan', expr: 'smile', text: 'جبتلكم حلو للمقهى. الله يخليك يا نديم، ردّيت الروح لحسن.', end: true },
      um_post_hiba: { who: 'umHasan', expr: 'angry', text: '…', end: true },
      um_post_zulm: { who: 'umHasan', expr: 'sad', text: 'الله يسامحنا كلنا يا نديم. الله أعلم بالحقيقة.', end: true },
    },
  },
};

// عبارات عابرة للسكان (barks) — تتغيّر بالسمعة والوقت
export const BARKS = {
  greet: [
    { cond: (s) => s.rep('amana') >= 3, t: 'يا أمين الحارة، الله يعطيك العافية!' },
    { cond: (s) => s.rep('haiba') >= 3, t: 'تفضل يا نديم، الحارة بتحسب لك حساب.' },
    { cond: (s) => s.rep('amana') <= -3, t: 'همممم… نديم. شو القصة اليوم؟' },
    { cond: () => true, t: 'مساء الخير يا نديم.' },
    { cond: () => true, t: 'الله يعطيك العافية.' },
    { cond: () => true, t: 'كيف الأحوال يا ابن الحارة؟' },
  ],
  evening: ['قرّب المغرب… خلصوا شغلكم قبل ما يسكّروا الباب.', 'الله يستر… الجو صار بارد.', 'هلق بيشعلوا الفوانيس.'],
  detained: ['سمعت إنو العكيد مسك البياع الغريب…', 'الغريب دايماً أول متّهم!'],
  peddler: ['أنا بس ببيع خرز وشرايط يا سيدي، والله ما لي علاقة!', 'شو عملت أنا؟ الله شاهد عليّ!'],
  peddlerFree: ['الله يجزيك خير… ما بنساها.'],
};
