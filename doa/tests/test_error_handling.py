"""Quick test to verify error handling in OpikMonitorIntegration."""

from utils.opik_integration import OpikMonitorIntegration
from config import load_config

# Load actual config from environment
engine_config = load_config()

# Test OpikMonitorIntegration
monitor = OpikMonitorIntegration(engine_config)

# Test graceful degradation
print('Testing graceful degradation...')

# Test start_cycle
cycle_id = monitor.start_cycle()
print(f'✓ start_cycle returned: {cycle_id}')

# Test record_discovery
monitor.record_discovery(5)
print('✓ record_discovery completed without error')

# Test record_analysis
monitor.record_analysis('test-condition', 1000.0, 0.01, True)
print('✓ record_analysis completed without error')

# Test get_trace_url
url = monitor.get_trace_url('test-condition')
print(f'✓ get_trace_url returned: {url[:50]}...')

# Test log_dashboard_link
monitor.log_dashboard_link()
print('✓ log_dashboard_link completed without error')

# Test end_cycle
metrics = monitor.end_cycle()
print(f'✓ end_cycle returned metrics: {metrics is not None}')

# Test get_aggregate_metrics
agg = monitor.get_aggregate_metrics()
print(f'✓ get_aggregate_metrics returned: total_cycles={agg.total_cycles}')

print('\nAll graceful degradation tests passed!')
