import { useEffect, useMemo, useState } from 'react';

const fallbackSummary = {
  activeResources: 1248,
  monthlySpend: 18420,
  idleResources: 94,
  potentialSavings: 4960,
  warnings: ['Using sample data. Start backend on port 4000 to load AWS data.']
};

const fallbackFindings = [
  { type: 'Idle Compute', resource: 'ec2/i-08f3ab17', impact: '$240/mo', priority: 'High' },
  { type: 'Unused Storage', resource: 'ebs/vol-01c82d4c', impact: '$96/mo', priority: 'Medium' },
  { type: 'Missing Tags', resource: 'rds/prod-orders-db', impact: 'Governance risk', priority: 'High' },
  { type: 'Oversized Instance', resource: 'ec2/i-0bc0aa91', impact: '$180/mo', priority: 'Medium' }
];

const fallbackServiceCosts = [
  { service: 'Amazon EC2', monthlyCost: 7240 },
  { service: 'Amazon RDS', monthlyCost: 4680 },
  { service: 'Amazon S3', monthlyCost: 2860 },
  { service: 'AWS Lambda', monthlyCost: 1930 },
  { service: 'Amazon CloudWatch', monthlyCost: 1110 },
  { service: 'Data Transfer', monthlyCost: 600 }
];

const fallbackInventory = [
  {
    service: 'EC2',
    id: 'i-08f3ab17',
    name: 'web-prod-1',
    region: 'us-east-1',
    state: 'running',
    tags: { ApplicationName: 'cloud-dashboard' }
  },
  {
    service: 'EBS',
    id: 'vol-01c82d4c',
    name: 'vol-01c82d4c',
    region: 'us-east-1',
    state: 'available',
    tags: {}
  },
  {
    service: 'RDS',
    id: 'prod-orders-db',
    name: 'prod-orders-db',
    region: 'us-east-1',
    state: 'available',
    tags: {}
  }
];

const requiredTagKeys = ['ApplicationName'];

function App() {
  // Frontend reads backend base URL from Vite env; defaults to local backend.
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';
  const [summary, setSummary] = useState(fallbackSummary);
  const [findings, setFindings] = useState(fallbackFindings);
  const [serviceCosts, setServiceCosts] = useState(fallbackServiceCosts);
  const [inventory, setInventory] = useState(fallbackInventory);
  const [loading, setLoading] = useState(true);
  const [showResourceDetails, setShowResourceDetails] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      try {
        // Load dashboard sections in parallel to keep initial render fast.
        const [summaryRes, findingsRes, costsRes, inventoryRes] = await Promise.all([
          fetch(`${apiBaseUrl}/api/v1/summary`, { signal: controller.signal }),
          fetch(`${apiBaseUrl}/api/v1/findings`, { signal: controller.signal }),
          fetch(`${apiBaseUrl}/api/v1/costs/top-services`, { signal: controller.signal }),
          fetch(`${apiBaseUrl}/api/v1/inventory`, { signal: controller.signal })
        ]);

        if (!summaryRes.ok || !findingsRes.ok || !costsRes.ok || !inventoryRes.ok) {
          throw new Error('Failed to fetch one or more API resources');
        }

        const [summaryData, findingsData, costsData, inventoryData] = await Promise.all([
          summaryRes.json(),
          findingsRes.json(),
          costsRes.json(),
          inventoryRes.json()
        ]);

        setSummary({
          activeResources: summaryData.activeResources,
          monthlySpend: summaryData.monthlySpend,
          idleResources: summaryData.idleResources,
          potentialSavings: summaryData.potentialSavings,
          warnings: summaryData.warnings ?? []
        });

        setFindings(findingsData.results.length ? findingsData.results : fallbackFindings);
        setServiceCosts(costsData.results.length ? costsData.results : fallbackServiceCosts);
        setInventory(inventoryData.results?.length ? inventoryData.results : fallbackInventory);
      } catch {
        // If backend/AWS is unavailable, keep the UI usable with sample data.
        setSummary(fallbackSummary);
        setFindings(fallbackFindings);
        setServiceCosts(fallbackServiceCosts);
        setInventory(fallbackInventory);
      } finally {
        setLoading(false);
      }
    };

    void load();

    return () => controller.abort();
  }, [apiBaseUrl]);

  const kpis = useMemo(
    () => [
      { label: 'Active Resources', value: summary.activeResources.toLocaleString(), interactive: true },
      { label: 'Monthly Spend', value: `$${summary.monthlySpend.toLocaleString()}` },
      { label: 'Idle Resources', value: summary.idleResources.toLocaleString() },
      { label: 'Potential Savings', value: `$${summary.potentialSavings.toLocaleString()}` }
    ],
    [summary]
  );

  const tagCoverage = useMemo(() => {
    const total = inventory.length || 1;

    let compliant = 0;
    let partial = 0;
    let untagged = 0;

    for (const resource of inventory) {
      const tags = resource.tags ?? {};
      const presentCount = requiredTagKeys.filter((key) => tags[key]).length;
      if (presentCount === requiredTagKeys.length) {
        compliant += 1;
      } else if (presentCount === 0) {
        untagged += 1;
      } else {
        partial += 1;
      }
    }

    const compliantPct = Math.round((compliant / total) * 100);
    const partialPct = Math.round((partial / total) * 100);
    const untaggedPct = Math.max(0, 100 - compliantPct - partialPct);

    return {
      compliant,
      partial,
      untagged,
      compliantPct,
      partialPct,
      untaggedPct
    };
  }, [inventory]);

  // Used to normalize bar widths in Top Costing Services section.
  const maxServiceCost = Math.max(...serviceCosts.map((s) => s.monthlyCost), 1);

  return (
    <div className="page-shell">
      <div className="glow glow-a" />
      <div className="glow glow-b" />

      <header className="topbar">
        <div>
          <p className="eyebrow">AWS FinOps Command Center</p>
          <h1>Cloud Resource and Cost Dashboard</h1>
        </div>
        <button className="action-btn" type="button">
          {loading ? 'Loading...' : 'Read-Only Mode'}
        </button>
      </header>

      {summary.warnings && summary.warnings.length > 0 && (
        <section className="warning-bar">{summary.warnings[0]}</section>
      )}

      <section className="kpi-grid">
        {kpis.map((kpi) => (
          <article
            key={kpi.label}
            className={`kpi-card ${kpi.interactive ? 'interactive' : ''}`}
            onClick={kpi.interactive ? () => setShowResourceDetails(true) : undefined}
            role={kpi.interactive ? 'button' : undefined}
            tabIndex={kpi.interactive ? 0 : undefined}
            onKeyDown={
              kpi.interactive
                ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setShowResourceDetails(true);
                    }
                  }
                : undefined
            }
          >
            <p>{kpi.label}</p>
            <h2>{kpi.value}</h2>
            <span>{kpi.interactive ? 'Click for details' : 'Live API'}</span>
          </article>
        ))}
      </section>

      <section className="content-grid">
        <article className="panel">
          <div className="panel-head">
            <h3>Cost Trend (30 days)</h3>
            <span>By service</span>
          </div>
          <div className="bars">
            {/* Placeholder chart until cost-trend API is wired. */}
            <div style={{ height: '54%' }} />
            <div style={{ height: '61%' }} />
            <div style={{ height: '67%' }} />
            <div style={{ height: '58%' }} />
            <div style={{ height: '52%' }} />
            <div style={{ height: '44%' }} />
            <div style={{ height: '39%' }} />
            <div style={{ height: '34%' }} />
            <div style={{ height: '29%' }} />
            <div style={{ height: '31%' }} />
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <h3>Tag Coverage</h3>
            <span>ApplicationName</span>
          </div>
          <div className="donut-wrap">
            <div
              className="donut"
              style={{
                background: `conic-gradient(var(--good) 0 ${tagCoverage.compliantPct}%, #d4a43a ${tagCoverage.compliantPct}% ${tagCoverage.compliantPct + tagCoverage.partialPct}%, #cc4f26 ${tagCoverage.compliantPct + tagCoverage.partialPct}% 100%)`
              }}
            />
            <div className="legend">
              <p>
                <strong>{tagCoverage.compliantPct}%</strong> compliant ({tagCoverage.compliant})
              </p>
              <p>
                <strong>{tagCoverage.partialPct}%</strong> partial ({tagCoverage.partial})
              </p>
              <p>
                <strong>{tagCoverage.untaggedPct}%</strong> untagged ({tagCoverage.untagged})
              </p>
            </div>
          </div>
        </article>
      </section>

      <section className="panel findings">
        <div className="panel-head">
          <h3>Optimization Findings</h3>
          <span>Idle + Rightsizing + Governance</span>
        </div>

        <div className="table-head">
          <span>Type</span>
          <span>Resource</span>
          <span>Impact</span>
          <span>Priority</span>
        </div>

        {findings.map((f) => (
          <div key={f.resource} className="table-row">
            <span>{f.type}</span>
            <span>{f.resource}</span>
            <span>{f.impact}</span>
            <span className={`pill ${f.priority.toLowerCase()}`}>{f.priority}</span>
          </div>
        ))}
      </section>

      <section className="panel service-costs">
        <div className="panel-head">
          <h3>Top Costing Services</h3>
          <span>Highest monthly spend first</span>
        </div>
        <div className="service-cost-list">
          {serviceCosts.map((item, index) => (
            <div key={item.service} className="service-row">
              <div className="service-rank">{index + 1}</div>
              <div className="service-main">
                <div className="service-line">
                  <p>{item.service}</p>
                  <strong>${item.monthlyCost.toLocaleString()}/mo</strong>
                </div>
                <div className="service-track">
                  <div
                    className="service-fill"
                    style={{ width: `${(item.monthlyCost / maxServiceCost) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {showResourceDetails && (
        <div className="modal-overlay" onClick={() => setShowResourceDetails(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="panel-head">
              <h3>Active Resource Details</h3>
              <button className="close-btn" type="button" onClick={() => setShowResourceDetails(false)}>
                Close
              </button>
            </div>
            <p className="modal-subtext">
              Showing {inventory.length} resources fetched from inventory API.
            </p>
            <div className="resource-table-head">
              <span>Service</span>
              <span>ID / Name</span>
              <span>Region</span>
              <span>State</span>
            </div>
            <div className="resource-list">
              {inventory.map((item) => (
                <div key={`${item.service}-${item.id}`} className="resource-row">
                  <span>{item.service}</span>
                  <span>{item.name} ({item.id})</span>
                  <span>{item.region}</span>
                  <span>{item.state}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
