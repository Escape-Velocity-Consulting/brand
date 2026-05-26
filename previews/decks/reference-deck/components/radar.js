// brand/components/radar.js — portable radar/spider chart
// Zero deps. Returns SVG string. Caller injects into a container.
// Mirrors website/scripts/quiz.js renderRadarChart(); kept in sync manually.
//
// Usage:
//   <div id="chart"></div>
//   <script src="components/radar.js"></script>
//   <script>
//     document.getElementById('chart').innerHTML =
//       renderRadarChart([3,2,1,4,4], [2], { labels: ['A','B','C','D','E'] });
//   </script>

function renderRadarChart(dimScores, weakDims, opts) {
  opts = opts || {};
  var labels = opts.labels || ['Prozesse', 'Tools', 'Daten', 'Team', 'Führung'];
  var maxVal = opts.maxVal || 6;
  var rings = opts.rings || [2, 4, 6];
  var n = labels.length;
  var cx = 200, cy = 160, maxR = 120;

  function angle(i) { return (Math.PI * 2 * i) / n - Math.PI / 2; }
  function pt(i, val) {
    var r = (val / maxVal) * maxR;
    return [cx + r * Math.cos(angle(i)), cy + r * Math.sin(angle(i))];
  }

  var svg = '<svg viewBox="0 0 400 320" class="radar-chart">';

  rings.forEach(function (ringVal) {
    var pts = [];
    for (var i = 0; i < n; i++) pts.push(pt(i, ringVal).join(','));
    svg += '<polygon points="' + pts.join(' ') + '" fill="none" stroke="rgba(0,0,0,0.08)" stroke-width="1"/>';
  });

  for (var i = 0; i < n; i++) {
    var ep = pt(i, maxVal);
    svg += '<line x1="' + cx + '" y1="' + cy + '" x2="' + ep[0] + '" y2="' + ep[1] + '" stroke="rgba(0,0,0,0.06)" stroke-width="1"/>';
  }

  var dataPts = [];
  for (var i = 0; i < n; i++) dataPts.push(pt(i, dimScores[i]).join(','));
  svg += '<polygon points="' + dataPts.join(' ') + '" fill="var(--color-terracotta)" fill-opacity="0.18" stroke="var(--color-terracotta)" stroke-width="2"/>';

  var wk = weakDims || [];
  for (var i = 0; i < n; i++) {
    var dp = pt(i, dimScores[i]);
    var isWeak = wk.indexOf(i) !== -1;
    if (isWeak) {
      svg += '<circle cx="' + dp[0] + '" cy="' + dp[1] + '" r="12" fill="#C4553A" fill-opacity="0.5" class="radar-dot-pulse"/>';
    }
    svg += '<circle cx="' + dp[0] + '" cy="' + dp[1] + '" r="5" fill="' + (isWeak ? '#C4553A' : 'var(--color-terracotta)') + '" stroke="#fff" stroke-width="2"/>';
  }

  var labelOffsets = [[0,-14],[14,0],[10,14],[-10,14],[-14,0]];
  var anchors = ['middle','start','start','end','end'];
  for (var i = 0; i < n; i++) {
    var lp = pt(i, maxVal);
    var off = labelOffsets[i] || [0, 0];
    var anch = anchors[i] || 'middle';
    svg += '<text x="' + (lp[0] + off[0]) + '" y="' + (lp[1] + off[1]) + '" text-anchor="' + anch + '" class="radar-label">' + labels[i] + '</text>';
  }

  svg += '</svg>';
  return svg;
}

if (typeof window !== 'undefined') window.renderRadarChart = renderRadarChart;
