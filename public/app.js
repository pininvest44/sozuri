document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('stkForm');
  const logBody = document.getElementById('logBody');
  const submitBtn = document.getElementById('submitBtn');

  // Establish SSE stream for real-time response feedback
  const eventSource = new EventSource('/api/logs/stream');

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    appendLogRow(data);
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const rawNumbers = document.getElementById('numbers').value;
    const amount = document.getElementById('amount').value;
    const reference = document.getElementById('reference').value;

    const numbersArray = rawNumbers
      .split(/[\n,]+/)
      .map((n) => n.trim())
      .filter((n) => n.length > 0);

    if (numbersArray.length === 0) {
      alert('Please enter at least one valid phone number.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Processing Queue...';

    try {
      const response = await fetch('/api/stk/bulk-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numbers: numbersArray, amount, reference })
      });

      const resData = await response.json();
      if (!response.ok) {
        alert(resData.error || 'Failed to submit batch.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Start Bulk STK Push';
      }
    } catch (err) {
      alert('Network error connecting to backend.');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Start Bulk STK Push';
    }
  });

  function appendLogRow(data) {
    if (logBody.children[0]?.children[0]?.getAttribute('colspan') === '6') {
      logBody.innerHTML = '';
    }

    const tr = document.createElement('tr');

    if (data.type === 'COMPLETE') {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Start Bulk STK Push';
    }

    tr.innerHTML = `
      <td>${data.timestamp || new Date().toLocaleTimeString()}</td>
      <td>${data.phone || '-'}</td>
      <td>${data.amount ? 'KES ' + data.amount : '-'}</td>
      <td>${data.reference || '-'}</td>
      <td class="status-${data.type}">${data.type}</td>
      <td><pre style="font-size:11px">${JSON.stringify(data.data || data.error || data.message || {})}</pre></td>
    `;

    logBody.prepend(tr);
  }
});
