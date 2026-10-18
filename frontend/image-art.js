(function (root) {
  const palettes = [
    ['#101b35', '#423979', '#f4a261', '#f6d5a7', '#263c5c', '#31576a'],
    ['#132a2e', '#32746f', '#f2a65a', '#ffe0a3', '#244b48', '#47766b'],
    ['#251b3e', '#75538f', '#f2a1a0', '#ffe0cb', '#45345d', '#69628b'],
    ['#183047', '#417aa1', '#f6bd60', '#fff0c4', '#254d62', '#558b79']
  ];

  function escapeXml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
    })[character]);
  }

  function hash(value) {
    let result = 2166136261;
    for (let index = 0; index < value.length; index++) {
      result ^= value.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return result >>> 0;
  }

  function sceneFor(prompt) {
    const text = prompt.toLowerCase();
    if (/flower|garden|rose|tulip|blossom|bouquet/.test(text)) return 'garden';
    if (/ocean|sea|beach|wave|waterfall|lake|river/.test(text)) return 'water';
    if (/city|building|skyline|street|urban|house|village/.test(text)) return 'city';
    if (/forest|tree|woodland|jungle|pine/.test(text)) return 'forest';
    if (/space|planet|galaxy|cosmos|astronaut|moon|star/.test(text)) return 'space';
    if (/mountain|hill|sunrise|sunset|desert|landscape|nature/.test(text)) return 'mountains';
    return 'dreamscape';
  }

  function foreground(scene, colors) {
    if (scene === 'garden') {
      return `<path d="M0 690 Q230 610 500 700 T1024 670 V1024 H0Z" fill="${colors[4]}"/>
        <path d="M180 900Q210 730 250 570M510 940Q530 740 500 590M800 910Q770 730 810 550" fill="none" stroke="${colors[5]}" stroke-width="18" stroke-linecap="round"/>
        <g fill="${colors[2]}" stroke="${colors[3]}" stroke-width="8">
          <circle cx="250" cy="560" r="48"/><circle cx="205" cy="560" r="30"/><circle cx="295" cy="560" r="30"/><circle cx="250" cy="515" r="30"/><circle cx="250" cy="605" r="30"/>
          <circle cx="500" cy="570" r="48"/><circle cx="455" cy="570" r="30"/><circle cx="545" cy="570" r="30"/><circle cx="500" cy="525" r="30"/><circle cx="500" cy="615" r="30"/>
          <circle cx="810" cy="530" r="48"/><circle cx="765" cy="530" r="30"/><circle cx="855" cy="530" r="30"/><circle cx="810" cy="485" r="30"/><circle cx="810" cy="575" r="30"/>
        </g><g fill="${colors[2]}"><circle cx="250" cy="560" r="12" fill="${colors[3]}"/><circle cx="500" cy="570" r="12" fill="${colors[3]}"/><circle cx="810" cy="530" r="12" fill="${colors[3]}"/></g>`;
    }
    if (scene === 'water') {
      return `<path d="M0 540 Q200 505 420 550 T1024 535 V1024 H0Z" fill="${colors[5]}"/>
        <path d="M0 650 Q180 605 360 650 T720 650 T1080 650M-40 760 Q160 720 360 760 T760 760 T1100 760M0 870 Q200 830 400 870 T800 870 T1100 870" fill="none" stroke="${colors[3]}" stroke-opacity=".48" stroke-width="13" stroke-linecap="round"/>
        <path d="M0 530L180 310 360 525M250 540L500 275 730 535M610 530L825 350 1024 520" fill="${colors[4]}"/>`;
    }
    if (scene === 'city') {
      return `<path d="M0 650H130V430H250V560H360V320H510V530H620V390H755V565H860V290H1024V1024H0Z" fill="${colors[4]}"/>
        <g fill="${colors[2]}" opacity=".9">
          <path d="M165 475h28v34h-28zm45 0h28v34h-28zm-45 58h28v34h-28zm45 0h28v34h-28zM395 365h32v40h-32zm52 0h32v40h-32zm-52 68h32v40h-32zm52 0h32v40h-32zM665 435h28v36h-28zm48 0h28v36h-28zm-48 65h28v36h-28zm48 0h28v36h-28zM900 345h34v42h-34zm55 0h34v42h-34zm-55 68h34v42h-34zm55 0h34v42h-34z"/>
        </g><path d="M0 720Q280 680 520 725T1024 710V1024H0Z" fill="${colors[5]}"/>`;
    }
    if (scene === 'forest') {
      return `<path d="M0 650L180 320 360 650 280 650 470 270 690 650 610 650 820 300 1024 650V1024H0Z" fill="${colors[4]}"/>
        <path d="M0 790Q240 690 480 790T1024 770V1024H0Z" fill="${colors[5]}"/>
        <g fill="${colors[3]}" opacity=".7"><circle cx="160" cy="720" r="9"/><circle cx="320" cy="840" r="7"/><circle cx="740" cy="750" r="8"/><circle cx="900" cy="870" r="10"/></g>`;
    }
    if (scene === 'space') {
      return `<circle cx="690" cy="445" r="145" fill="${colors[2]}"/><circle cx="740" cy="405" r="130" fill="${colors[1]}"/>
        <g fill="${colors[3]}"><circle cx="150" cy="300" r="5"/><circle cx="300" cy="450" r="8"/><circle cx="470" cy="240" r="5"/><circle cx="890" cy="250" r="7"/><circle cx="880" cy="630" r="5"/><circle cx="250" cy="650" r="6"/><circle cx="550" cy="690" r="4"/></g>
        <path d="M0 820Q230 690 500 820T1024 790V1024H0Z" fill="${colors[4]}"/>`;
    }
    return `<path d="M0 650L170 390 300 540 505 285 705 555 855 355 1024 610V1024H0Z" fill="${colors[4]}"/>
      <path d="M0 755Q210 670 420 760T840 745T1200 760V1024H0Z" fill="${colors[5]}"/>
      <path d="M0 885Q260 790 520 885T1040 870V1024H0Z" fill="${colors[2]}" opacity=".55"/>`;
  }

  function create(prompt, aspectRatio = '1:1') {
    const description = typeof prompt === 'string' ? prompt.trim() : '';
    if (description.length < 10 || description.length > 2000) {
      throw new Error('Image prompt must be between 10 and 2000 characters.');
    }
    if (!['1:1', '16:9', '9:16'].includes(aspectRatio)) {
      throw new Error('Choose a square, landscape, or portrait aspect ratio.');
    }
    const [width, height] = aspectRatio === '16:9' ? [1024, 576] :
      aspectRatio === '9:16' ? [576, 1024] : [768, 768];
    const colors = palettes[hash(description) % palettes.length];
    const scene = sceneFor(description);
    const title = escapeXml(description.length > 86 ? `${description.slice(0, 83)}...` : description);
    const sceneArt = foreground(scene, colors);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 1024 1024" role="img" aria-labelledby="title desc">
      <title id="title">${title}</title><desc id="desc">A locally generated ${scene} vector illustration based on the prompt.</desc>
      <defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="${colors[0]}"/><stop offset="1" stop-color="${colors[1]}"/></linearGradient>
      <radialGradient id="glow"><stop stop-color="${colors[3]}" stop-opacity=".85"/><stop offset="1" stop-color="${colors[2]}" stop-opacity="0"/></radialGradient></defs>
      <rect width="1024" height="1024" fill="url(#sky)"/><circle cx="510" cy="430" r="285" fill="url(#glow)"/>
      <circle cx="510" cy="430" r="76" fill="${colors[2]}"/>
      <g fill="${colors[3]}" opacity=".85"><circle cx="122" cy="192" r="5"/><circle cx="268" cy="260" r="4"/><circle cx="816" cy="190" r="6"/><circle cx="905" cy="322" r="4"/><circle cx="702" cy="270" r="3"/></g>
      ${sceneArt}
      <rect x="32" y="900" width="960" height="88" rx="22" fill="${colors[0]}" fill-opacity=".78"/>
      <text x="64" y="954" fill="#fff" font-family="system-ui,sans-serif" font-size="25">${title}</text>
    </svg>`;
  }

  const api = { create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.WRImageArt = api;
})(typeof window === 'undefined' ? null : window);
