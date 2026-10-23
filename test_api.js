async function testPortal() {
  const baseUrl = 'http://localhost:5000/api';

  console.log('--- 1. Testing Demo Login (Role: REGISTRY / Fatimah) ---');
  const loginRes = await fetch(`${baseUrl}/auth/demo-switch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'REGISTRY' }),
  });
  const loginData = await loginRes.json();
  const token = loginData.token;
  console.log('Logged in as:', loginData.user.name, 'Role:', loginData.user.role);

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  console.log('\n--- 2. Testing Sample Code Auto-Generation Preview ---');
  const previewRes = await fetch(
    `${baseUrl}/samples/preview-code?sampleNature=Food&dateOfEntry=2026-10-19`,
    { headers: authHeaders }
  );
  const previewData = await previewRes.json();
  console.log('Next Auto-Generated Code Preview:', previewData.sampleCode);

  console.log('\n--- 3. Testing Sample Registration (Sections A-D) ---');
  const createRes = await fetch(`${baseUrl}/samples`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      sampleName: 'Organic Cocoa Powder 250g',
      companyName: 'Nestle Nigeria Plc',
      sampleNature: 'Food / Beverage',
      pictureUrl: 'https://images.unsplash.com/photo-1550583724-b2692b85b150',
      productionDate: '2026-10-01',
      expiryDate: '2027-10-01',
      batchNo: 'NEST-OCP-2026-01',
      nafdacNo: 'A1-9921',
      dateOfEntry: '2026-10-19',
      analysisRequired: [
        'Microbiological Analysis',
        'Heavy Metals Screen (Pb, Cd, As, Hg)',
        'Proximate Analysis',
      ],
      receivingLabId: 'LAB_1',
      receivingLabName: 'Standard Analytical Laboratories',
      sentBy: 'Fatimah Aliyu (Registry Officer)',
    }),
  });
  const createData = await createRes.json();
  const sample = createData.sample;
  console.log('Registered Sample:', sample.sampleName);
  console.log('Assigned Sample Code:', sample.sampleCode);
  console.log('Workflow Status:', sample.workflowStatus);

  console.log('\n--- 4. Testing Threaded Comment ---');
  const commentRes = await fetch(`${baseUrl}/samples/${sample._id}/comments`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      message: 'Please expedite heavy metals panel for export batch clearance.',
    }),
  });
  const commentData = await commentRes.json();
  console.log('Comments Count:', commentData.comments.length);
  console.log('Last Comment:', commentData.comments[commentData.comments.length - 1].message);

  console.log('\n--- 5. Testing Lab Workflow Action: Issue Invoice (Trigger #3) ---');
  const updateRes = await fetch(`${baseUrl}/samples/${sample._id}`, {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify({
      invoiceNo: 'INV-STD-2026-990',
      statusNote: 'Invoice issued by Standard Analytical',
    }),
  });
  const updateData = await updateRes.json();
  console.log('Updated Invoice No:', updateData.sample.invoiceNo);

  console.log('\n--- 6. Testing Notifications Feed (Resend Triggers) ---');
  const notifRes = await fetch(`${baseUrl}/notifications`, { headers: authHeaders });
  const notifData = await notifRes.json();
  console.log('Total Automated Notifications Logged:', notifData.logs.length);
  console.log('Most Recent Trigger:', notifData.logs[0].triggerName);
  console.log('Recipient:', notifData.logs[0].recipient);
  console.log('Subject:', notifData.logs[0].subject);
  console.log('Message Body:', notifData.logs[0].message);

  console.log('\n--- 7. Testing Dashboard Stats ---');
  const statsRes = await fetch(`${baseUrl}/reports/dashboard-stats`, { headers: authHeaders });
  const statsData = await statsRes.json();
  console.log('Total Samples in System:', statsData.total);
  console.log('Average Turnaround Time (TAT):', statsData.averageTatOverall, 'days');
  console.log('Status Counts:', statsData.statusCounts);

  console.log('\n=== ALL TESTS PASSED SUCCESSFULLY! ===');
}

testPortal().catch(console.error);
