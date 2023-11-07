const core = require('@actions/core')

const { getLatestBenchmark } = require('./bench_data')


module.exports.evaluateCurrentBenchmark = function (
    currentBenchmark,
    completeBenchData,
    completeConfig
) {
  let evaluationResult;
  switch (completeConfig.evaluationConfig.evaluationMethod) {
    case 'threshold':
      evaluationResult = module.exports.evaluateWithThreshold(currentBenchmark, completeConfig.evaluationConfig);
      break;
    case 'previous':
      evaluationResult = module.exports.compareWithPrevious(currentBenchmark, completeBenchData, completeConfig);
      break;
      // Additional evaluation methods to be implemented here
    default:
      throw new Error(`Unsupported evaluation method: ${completeConfig.evaluationConfig.evaluationMethod}`);
  }
  // Log or process evaluationResult as needed
  console.log(evaluationResult);
  return evaluationResult;
}

module.exports.evaluateWithThreshold = function (currentBenchmarkData, config) {
  core.debug('Evaluating current benchmark with threshold method')
  core.debug('Current benchmark data: ' + JSON.stringify(currentBenchmarkData))
  // Destructure the required fields from the config object
  const { comparisonOperators, comparisonMargins, thresholdValues } = config;

  const actualValues = [];
  const metricNames = [];
  const metricUnits = [];
  const shouldBe = [];
  const thanValues = [];
  const evaluationResults = [];

  console.log('currentBenchmarkData.results: ' + currentBenchmarkData.results)
  currentBenchmarkData.simpleMetricResults.forEach((result, index) => {
    const value = result.value;
    const thresholdValue = thresholdValues[index];
    const margin = comparisonMargins[index];
    const operator = comparisonOperators[index];
    let isPassed;

    actualValues.push(value);
    metricNames.push(result.name);
    metricUnits.push(result.unit);
    // if operator is tolerance, put the string named: "in symmetric range to" instead of "tolerance"
    operator === 'tolerance' ? shouldBe.push('in symmetric range to') : shouldBe.push(operator);
    thanValues.push(thresholdValue);

    switch (operator) {
      case 'smaller':
        isPassed = margin < 0 ? value < thresholdValue : value <= thresholdValue * (1 - margin / 100);
        break;
      case 'bigger':
        isPassed = margin < 0 ? value > thresholdValue : value >= thresholdValue * (1 + margin / 100);
        break;
      case 'tolerance':
        isPassed = margin < 0 ? value === thresholdValue : value >= thresholdValue * (1 - margin / 100) && value <= thresholdValue * (1 + margin / 100);
        break;
      default:

        isPassed = false;
        break;
    }

    evaluationResults.push(isPassed ? 'passed' : 'failed');
  });

  return {
    "evaluation_method": "threshold",
    "metric_names": metricNames,
    "metric_units": metricUnits,
    "is": actualValues,
    "should_be": shouldBe,
    "than": thanValues,
    "result": evaluationResults
  };
};

module.exports.compareWithPrevious = function (currentBenchmarkData, completeBenchData, completeConfig) {
  const previousBenchmarkData = getLatestBenchmark(completeConfig.benchmarkName,
      completeConfig.folderWithBenchData, completeConfig.fileWithBenchData, 1);
  // First, find the previous benchmark => we will get obj not json
  core.debug('Previous benchmark data: ' + JSON.stringify(previousBenchmark));

  const { comparisonOperators, comparisonMargins } = completeConfig.evaluationConfig;

  const metricNames = [];
  const metricUnits = [];
  const shouldBe = [];
  const thanValues = [];
  const evaluationResults = [];

  const previousResultsMap = new Map(previousBenchmarkData.simpleMetricResults.map(
      result => [result.name, result]));

  currentBenchmarkData.simpleMetricResults.forEach((result, index) => {
    const currentName = result.name;
    const currentValue = result.value;
    const previousResult = previousResultsMap.get(currentName);
    let isPassed = 'no data';

    if (previousResult) {
      console.log('previousResult: ' + previousResult)
      const previousValue = previousResult.value;
      const margin = comparisonMargins[index];
      const operator = comparisonOperators[index];
      const thresholdValue = previousValue;

      metricNames.push(currentName);
      metricUnits.push(result.unit);
      shouldBe.push(operator);
      thanValues.push(thresholdValue);

      switch (operator) {
        case 'smaller':
          isPassed = margin < 0 ? currentValue < thresholdValue : currentValue <= thresholdValue * (1 - margin / 100);
          break;
        case 'bigger':
          isPassed = margin < 0 ? currentValue > thresholdValue : currentValue >= thresholdValue * (1 + margin / 100);
          break;
        case 'tolerance':
          isPassed = margin < 0 ? currentValue === thresholdValue : currentValue >= thresholdValue * (1 - margin / 100) && currentValue <= thresholdValue * (1 + margin / 100);
          break;
      }
      evaluationResults.push(typeof isPassed === 'boolean' ? (isPassed ? 'passed' : 'failed') : isPassed);
    } else {
      // If there is no matching metric in the previous results, push 'no data'
      metricNames.push(currentName);
      metricUnits.push(result.unit);
      shouldBe.push('N/A');
      thanValues.push('N/A');
      evaluationResults.push('no data');
    }
  });

  return {
    "evaluation_method": "comparison",
    "metric_names": metricNames,
    "metric_units": metricUnits,
    "should_be": shouldBe,
    "than": thanValues,
    "result": evaluationResults
  };
};

module.exports.allFailed = function (resultArray) {
  return resultArray.every(element => element === 'failed')
}

module.exports.anyFailed = function (resultArray) {
  return resultArray.some(element => element === 'failed')
}

module.exports.addResultToBenchmarkObject = function (
  currentBenchmark,
  resultArray,
  failingCondition
) {
  if (failingCondition === 'any') {
    currentBenchmark.benchSuccessful = module.exports.anyFailed(resultArray)
  } else if (failingCondition === 'all') {
    currentBenchmark.benchSuccessful = module.exports.allFailed(resultArray)
  } else {
    currentBenchmark.benchSuccessful = true
  }
}

function findClosestWeekOldBenchmark(benchmarkKey) {
  const data = {
    // ... the JSON data structure
  };

  const ONE_WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000; // one week in milliseconds
  const now = Date.now();

  if (!data.entries.hasOwnProperty(benchmarkKey)) {
    throw new Error(`No such benchmark key: '${benchmarkKey}' exists.`);
  }

  let benchmarks = data.entries[benchmarkKey];
  let closestBenchmark = null;
  let smallestDifference = Infinity;

  benchmarks.forEach(benchmark => {
    let difference = Math.abs(now - benchmark.date - ONE_WEEK_IN_MS);
    if (difference < smallestDifference) {
      smallestDifference = difference;
      closestBenchmark = benchmark;
    }
  });

  if (closestBenchmark === null) {
    throw new Error(`No benchmark under '${benchmarkKey}' is close to one week old.`);
  } else {
    console.log(`The closest benchmark to one week old under '${benchmarkKey}' is:`, closestBenchmark);
    return closestBenchmark;
  }
}
