// Dijkstra's shortest path for parking lot routing
// Models parking lanes as a weighted graph

/**
 * Build a simple parking lot graph
 * Nodes: 'entrance', 'exit', slot IDs, lane intersection points
 * Edges: lane connections with distances
 */

function buildParkingGraph(slots) {
  const graph = {};

  // Add standard nodes
  const addEdge = (a, b, weight = 1) => {
    if (!graph[a]) graph[a] = {};
    if (!graph[b]) graph[b] = {};
    graph[a][b] = weight;
    graph[b][a] = weight;
  };

  // Main lane nodes
  addEdge('entrance', 'lane-main-1', 1);
  addEdge('lane-main-1', 'lane-a-start', 1);
  addEdge('lane-main-1', 'lane-main-2', 1);
  addEdge('lane-main-2', 'lane-b-start', 1);
  addEdge('lane-main-2', 'lane-main-3', 1);
  addEdge('lane-main-3', 'lane-c-start', 1);
  addEdge('lane-main-3', 'exit', 2);

  // Zone A lanes (bikes)
  addEdge('lane-a-start', 'lane-a-row1', 1);
  addEdge('lane-a-row1', 'lane-a-row2', 1);
  addEdge('lane-a-row2', 'lane-a-row3', 1);
  addEdge('lane-a-row3', 'lane-a-row4', 1);

  // Zone B lanes (cars)
  addEdge('lane-b-start', 'lane-b-row1', 1);
  addEdge('lane-b-row1', 'lane-b-row2', 1);
  addEdge('lane-b-row2', 'lane-b-row3', 1);
  addEdge('lane-b-row3', 'lane-b-row4', 1);

  // Zone C lanes (staff)
  addEdge('lane-c-start', 'lane-c-row1', 1);
  addEdge('lane-c-row1', 'lane-c-row2', 1);

  // Connect slots to lane nodes
  for (const slot of slots) {
    const slotId = slot.id;
    const num = slot.slot_number;

    if (num.startsWith('A')) {
      const n = parseInt(num.slice(1));
      const row = Math.ceil(n / 4);
      const laneNode = `lane-a-row${row}`;
      addEdge(laneNode, slotId, 0.5);
    } else if (num.startsWith('B')) {
      const n = parseInt(num.slice(1));
      const row = Math.ceil(n / 3);
      const laneNode = `lane-b-row${row}`;
      addEdge(laneNode, slotId, 0.5);
    } else if (num.startsWith('C')) {
      const n = parseInt(num.slice(1));
      const row = Math.ceil(n / 4);
      const laneNode = `lane-c-row${row}`;
      addEdge(laneNode, slotId, 0.5);
    }
  }

  return graph;
}

/**
 * Dijkstra's algorithm
 * Returns { path: [...nodeIds], distance: number } or null if no path
 */
function dijkstra(graph, start, end) {
  const dist = {};
  const prev = {};
  const visited = new Set();
  const queue = new Set(Object.keys(graph));

  for (const node of queue) {
    dist[node] = Infinity;
    prev[node] = null;
  }
  dist[start] = 0;

  while (queue.size > 0) {
    // Find unvisited node with minimum distance
    let u = null;
    let minDist = Infinity;
    for (const node of queue) {
      if (dist[node] < minDist) {
        minDist = dist[node];
        u = node;
      }
    }

    if (u === null || u === end) break;
    queue.delete(u);
    visited.add(u);

    const neighbors = graph[u] || {};
    for (const [v, weight] of Object.entries(neighbors)) {
      if (visited.has(v)) continue;
      const alt = dist[u] + weight;
      if (alt < dist[v]) {
        dist[v] = alt;
        prev[v] = u;
      }
    }
  }

  if (dist[end] === Infinity) return null;

  // Reconstruct path
  const path = [];
  let current = end;
  while (current !== null) {
    path.unshift(current);
    current = prev[current];
  }

  return { path, distance: dist[end] };
}

/**
 * Get route from parking entrance to a specific slot
 */
function getRouteToSlot(slots, slotId) {
  const graph = buildParkingGraph(slots);

  if (!graph['entrance']) return null;
  if (!graph[slotId]) return null;

  return dijkstra(graph, 'entrance', slotId);
}

module.exports = { dijkstra, buildParkingGraph, getRouteToSlot };
