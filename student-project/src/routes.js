const { AppError } = require('./errors');

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new AppError(400, 'Body must be valid JSON'));
      }
    });
  });
}

async function handleRequest(req, res, service) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean);

    if (req.method === 'GET' && url.pathname === '/slots') {
      return sendJson(res, 200, service.listSlots());
    }
    if (req.method === 'POST' && url.pathname === '/bookings') {
      const body = await readBody(req);
      return sendJson(res, 201, service.bookTickets(body));
    }
    if (parts[0] === 'bookings' && parts.length === 2) {
      if (req.method === 'GET') return sendJson(res, 200, service.getBooking(parts[1]));
      if (req.method === 'DELETE') return sendJson(res, 200, service.cancelBooking(parts[1]));
    }
    sendJson(res, 404, { error: 'Route not found' });
  } catch (err) {
    const status = err instanceof AppError ? err.status : 500;
    sendJson(res, status, { error: err.message });
  }
}

module.exports = { handleRequest };
