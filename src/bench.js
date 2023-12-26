const { getCommit, getCommitReplacementWhenTriggeredByScheduledEvent } = require('./commit')
const core = require('@actions/core')

const { SimpleMetricResult } = require('./types')
const { CompleteBenchmark } = require('./types')
const { BenchmarkInfo } = require('./types')

module.exports.createCurrBench = function (config) {
  core.debug('--- start createCurrBench ---')
  let currBenchResJson;
  if (config.subsetOfBenchRes) {
    currBenchResJson = config.subsetOfBenchRes;
  } else {
    currBenchResJson = config.currBenchResJson
  }
  const benchInfoJson = currBenchResJson.benchInfo
  const benchInfo = new BenchmarkInfo(
    benchInfoJson.executionTime,
    benchInfoJson.parametrization,
    benchInfoJson.otherInfo
  )

  const metricResults = currBenchResJson.results.map(item => {
    const numericValue = Number(item.value);
    if (isNaN(numericValue)) {
      console.error(`Value for ${item.name} is not a number.`);
      return null;
    }
    return new SimpleMetricResult(item.name, numericValue, item.unit);
  }).filter(result => result !== null);

  let commit;
  // if config.eventName === schedule, then we will not have
  if (config.eventName === 'schedule') {
    core.info('The workflow was triggered by a scheduled event.');
    commit = getCommitReplacementWhenTriggeredByScheduledEvent(config.runId);
  } else {
    commit = getCommit();
  }
  core.debug(`commit: ${JSON.stringify(commit)}`);
  const completeBenchmark = new CompleteBenchmark(
    config.benchmarkGroupName,
    benchInfo,
    metricResults,
    commit
  )
  core.debug('--- end createCurrBench ---')
  return completeBenchmark;
}
