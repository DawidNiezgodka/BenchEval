const core = require('@actions/core')

module.exports.evaluateCurrentBenchmark = function (
    currentBenchmark,
    completeBenchData,
    evaluationConfig
) {
  let evaluationResult;
  switch (evaluationConfig.evaluationMethod) {
    case 'threshold':
      evaluationResult = module.exports.evaluateWithThreshold(completeBenchData, config);
      break;
    case 'threshold_range':
      //evaluationResult = evaluateWithThresholdRange(currentBenchmark, evaluationConfig);
      break;
      // Additional evaluation methods to be implemented here
    default:
      throw new Error(`Unsupported evaluation method: ${config.evaluationMethod}`);
  }
  // Log or process evaluationResult as needed
  console.log(evaluationResult);
  return evaluationResult;
}

module.exports.evaluateWithThreshold = function (currentBenchmarkData, config) {
  // Destructure the required fields from the config object
  const { comparisonOperators, comparisonMargins, thresholdValues } = config;

  const metricNames = [];
  const metricUnits = [];
  const shouldBe = [];
  const thanValues = [];
  const evaluationResults = [];

  currentBenchmarkData.results.forEach((result, index) => {
    const value = result.value;
    const thresholdValue = thresholdValues[index];
    const margin = comparisonMargins[index];
    const operator = comparisonOperators[index];
    let isPassed;

    metricNames.push(result.name);
    metricUnits.push(result.unit);
    shouldBe.push(operator);
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
    "should_be": shouldBe,
    "than": thanValues,
    "result": evaluationResults
  };
};


module.exports.evaluateThresholds = function (
  currentBenchmark,
  thresholdArray,
  comparisonModes,
  comparisonMargins
) {
  const metricsInfo = currentBenchmark.simpleMetricResults
  if (
    thresholdArray.length !== metricsInfo.length ||
    comparisonModes.length !== metricsInfo.length ||
    comparisonMargins.length !== metricsInfo.length
  ) {
    throw new Error(
      'The lengths of the arrays should match the number of objects in jsonData.'
    )
  }

  const result = []

  for (let i = 0; i < metricsInfo.length; i++) {
    const metricInfo = metricsInfo[i]
    const threshold = thresholdArray[i]
    const mode = comparisonModes[i]
    const margin = comparisonMargins[i]

    const value = metricInfo.value

    if (mode === 'smaller') {
      result.push(value < threshold ? 'passed' : 'failed')
    } else if (mode === 'bigger') {
      result.push(value > threshold ? 'passed' : 'failed')
    } else if (mode === 'range') {
      if (margin === -1) {
        throw new Error(
          "Invalid percentage margin for 'range' comparison mode."
        )
      }
      const lowerLimit = threshold * (1 - margin / 100)
      const upperLimit = threshold * (1 + margin / 100)
      result.push(
        value >= lowerLimit && value <= upperLimit ? 'passed' : 'failed'
      )
    } else {
      throw new Error('Invalid comparison mode.')
    }
  }
  core.debug(
    'Finished evaluating currentBenchmark against thresholds with the following result: ' +
      result
  )
  return result
}

module.exports.compareWithPrev = function (
  currentBenchmark,
  previousBenchmark,
  comparisonModes,
  comparisonMargins
) {
  const currentBenchName = currentBenchmark.benchName
  const previousBenchName = previousBenchmark.benchName

  core.debug(`Metrics for ${currentBenchmark.benchmarkName}:`)
  currentBenchmark.simpleMetricResults.forEach(metric => {
    core.debug(`  ${metric.name}: ${metric.value}`)
  })

  core.debug(`Metrics for ${previousBenchmark.benchmarkName}:`)
  previousBenchmark.simpleMetricResults.forEach(metric => {
    core.debug(`  ${metric.name}: ${metric.value}`)
  })

  const results = []

  for (const [
    i,
    currentMetric
  ] of currentBenchmark.simpleMetricResults.entries()) {
    const prev = previousBenchmark.simpleMetricResults.find(
      j => j.name === currentMetric.name
    )
    core.debug(prev)
    let comparisonMode = comparisonModes[i]
    console.log('comparisonMode: ' + comparisonMode)
    let comparisonMargin = comparisonMargins[i]
    console.log('comparisonMargin: ' + comparisonMargin)
    let currentBetter

    if (prev) {
      console.log('current metric: ' + currentMetric.value)
      console.log('prev metric: ' + prev.value)
      console.log('Entering prev if...')
      if (comparisonMode === 'bigger') {
        if (comparisonMargin === '-1') {
          results.push(currentMetric.value > prev.value ? 'passed' : 'failed')
        } else {
          const lowerLimit = prev.value * (1 + comparisonMargin / 100)
          results.push(currentMetric.value >= lowerLimit ? 'passed' : 'failed')
        }
      } else if (comparisonMode === 'smaller') {
        if (comparisonMargin === '-1') {
          results.push(currentMetric.value < prev.value ? 'passed' : 'failed')
        } else {
          const upperLimit = prev.value * (1 - comparisonMargin / 100)
          results.push(currentMetric.value <= upperLimit ? 'passed' : 'failed')
        }
      } else if (comparisonMode === 'range') {
        const lowerLimit = prev.value * (1 - comparisonMargin / 100)
        const upperLimit = prev.value * (1 + comparisonMargin / 100)
        currentBetter =
          currentMetric.value >= lowerLimit && currentMetric.value <= upperLimit
        results.push(currentBetter ? 'passed' : 'failed')
      } else {
        throw new Error(`Unknown threshold comparison mode: ${comparisonMode}`)
      }

      return results
    }
  }
}

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
