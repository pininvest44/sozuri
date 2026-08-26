require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const SOZURI_API_KEY = process.env.SOZURI_API_KEY;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Store SSE clients for live logging
let sseClients = [];

// SSE Endpoint for live status logs
app.get('/api/logs/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  sseClients.push(res);

  req.on('close', () => {
    sseClients = sseClients.filter((client) => client !== res);
  });
});

function broadcastLog(data) {
  sseClients.forEach((client) => {
    client.write(`data: ${JSON.stringify(data)}\n\n`);
  });
}

// Queue system for 10 requests / minute rate limit (6 sec delay per item)
const queue = [];
let isProcessing = false;
const REQUEST_INTERVAL = 6000; // 60,000ms / 10 = 6,000ms

async function processQueue() {
  if (queue.length === 0) {
    isProcessing = false;
    broadcastLog({ type: 'COMPLETE', message: 'All batch STK pushes processed.' });
    return;
  }

  isProcessing = true;
  const task = queue.shift();

  try {
    const response = await axios.post(
      'https://sozuri.net/api/v1/zuka/push',
      {
        phone: task.phone,
        amount: Number(task.amount),
        account_reference: task.reference || 'WALLET-TOPUP'
      },
      {
        headers: {
          'Authorization': `Bearer ${SOZURI_API_KEY}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );

    broadcastLog({
      type: 'SUCCESS',
      phone: task.phone,
      amount: task.amount,
      reference: task.reference,
      status: response.status,
      data: response.data,
      timestamp: new Date().toLocaleTimeString()
    });
  } catch (error) {
    broadcastLog({
      type: 'ERROR',
      phone: task.phone,
      amount: task.amount,
      reference: task.reference,
      error: error.response ? error.response.data : error.message,
      timestamp: new Date().toLocaleTimeString()
    });
  }

  // Delay before next request to honor rate limits
  setTimeout(processQueue, REQUEST_INTERVAL);
}

// Trigger Endpoint
app.post('/api/stk/bulk-push', (req, res) => {
  const { numbers, amount, reference } = req.body;

  if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {
    return res.status(400).json({ error: 'Valid array of phone numbers is required.' });
  }

  if (!amount || isNaN(amount) || amount < 1) {
    return res.status(400).json({ error: 'Valid amount greater than 0 is required.' });
  }

  numbers.forEach((phone) => {
    queue.push({
      phone: phone.trim(),
      amount,
      reference: reference ? reference.trim() : 'WALLET-TOPUP'
    });
  });

  broadcastLog({
    type: 'INFO',
    message: `Enqueued ${numbers.length} requests. Rate limit: 10 req/min (6s spacing).`
  });

  if (!isProcessing) {
    processQueue();
  }

  res.json({ message: 'STK push batch queued successfully.', count: numbers.length });
});

app.listen(PORT, () => {
  console.log(`Sozuri Bulk STK Server running on port ${PORT}`);
});
