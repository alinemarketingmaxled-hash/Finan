// Ícones de linha minimalistas (SVG inline, sem dependências externas).
(function (global) {
  const PATHS = {
    home: 'M3 11.5 12 4l9 7.5 M5.5 10v9.5a1 1 0 0 0 1 1H9.5v-6h5v6H17.5a1 1 0 0 0 1-1V10',
    list: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
    layers: 'm12 3 9 5-9 5-9-5 9-5Z M3 13l9 5 9-5 M3 8l9 5 9-5',
    banknote: 'M3 7h18v10H3z M12 10.5a1.5 2 0 1 0 0 4 1.5 2 0 1 0 0-4Z M7 7v10 M17 7v10',
    fileText: 'M7 3h7l5 5v13H7z M14 3v5h5 M9.5 13h5 M9.5 16.5h5',
    tag: 'm12 2 8.5 8.5a2 2 0 0 1 0 2.8l-6.4 6.4a2 2 0 0 1-2.8 0L3 11.4V2h9.4Z M7.5 7.5h.01',
    calendarCheck: 'M5 4.5h14a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1Z M4 9.5h16 M8 3v3 M16 3v3 M8.5 14l2 2 4-4',
    activity: 'M3 12h4l2.5-7L14 19l2.5-7H21',
    trendingUp: 'M3 17l6-6 4 4 8-8 M15 7h6v6',
    target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M12 12h.01',
    wallet: 'M3 7.5A1.5 1.5 0 0 1 4.5 6h13A1.5 1.5 0 0 1 19 7.5v10a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 17.5v-10Z M15.5 12.5h3.5v3h-3.5a1.5 1.5 0 0 1 0-3Z M3 9h16',
    bulb: 'M9 18h6 M10 21h4 M12 3a6 6 0 0 0-4 10.5c.7.6 1 1.3 1 2.5h6c0-1.2.3-1.9 1-2.5A6 6 0 0 0 12 3Z',
    download: 'M12 3v12 M7 10l5 5 5-5 M4 19h16',
    upload: 'M12 21V9 M7 14l5-5 5 5 M4 4h16',
    settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z M19.4 13a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V19a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H4a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H10a1.7 1.7 0 0 0 1-1.6V4a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V10c.1.7.6 1.3 1.6 1H20a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.6 1Z',
    search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z M21 21l-4.35-4.35',
    sun: 'M12 4V2 M12 22v-2 M4 12H2 M22 12h-2 M5.6 5.6 4.2 4.2 M19.8 19.8l-1.4-1.4 M18.4 5.6l1.4-1.4 M4.2 19.8l1.4-1.4 M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z',
    moon: 'M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z',
    chevronLeft: 'm15 18-6-6 6-6',
    chevronRight: 'm9 18 6-6-6-6',
    chevronDown: 'm6 9 6 6 6-6',
    menu: 'M4 6h16 M4 12h16 M4 18h16',
    x: 'M18 6 6 18 M6 6l12 12',
    plus: 'M12 5v14 M5 12h14',
    trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6',
    arrowUp: 'M12 19V5 M5 12l7-7 7 7',
    arrowDown: 'M12 5v14 M19 12l-7 7-7-7',
    alertTriangle: 'M10.3 3.9 2 18a1.5 1.5 0 0 0 1.3 2.3h17.4A1.5 1.5 0 0 0 22 18L13.7 3.9a1.5 1.5 0 0 0-2.6 0Z M12 9v4 M12 17h.01',
    checkCircle: 'M21 11.1V12a9 9 0 1 1-5.3-8.2 M22 4 12 14.01l-3-3',
    info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 16v-5 M12 8h.01',
    building: 'M4 21V6a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v15 M12 21v-9a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v9 M8 9h.01 M8 12h.01 M8 15h.01 M2 21h20',
    truck: 'M3 16.5V6a1 1 0 0 1 1-1h9v11.5 M13 8.5h4l3 3.5v4.5h-2 M5.5 19.5a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6Z M16.5 19.5a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6Z M3 8.5h5',
    users: 'M17 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 5 18.5V20 M9.5 11.5a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Z M19 20v-1.5a3.5 3.5 0 0 0-2.5-3.35 M14.5 5.2a3.25 3.25 0 0 1 0 6.1',
    printer: 'M6 9V3h12v6 M6 18H4a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-2 M6 14h12v7H6z',
    sparkles: 'm12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z M19 15l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7.7-2.1Z',
  };

  function icon(name, opts) {
    opts = opts || {};
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", opts.size || 18);
    svg.setAttribute("height", opts.size || 18);
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", opts.strokeWidth || 1.8);
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    const d = PATHS[name];
    if (!d) return svg;
    d.split(" M").forEach((part, i) => {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", i === 0 ? part : "M" + part);
      svg.appendChild(path);
    });
    return svg;
  }

  global.Icon = icon;
})(window);
