const core = require('@actions/core')

const { getLatestBenchmark, getNLatestBenchmarks, getBenchFromWeekAgo,
  getBenchmarkOfStableBranch} = require('./bench_data')

const { ReferenceBenchmarks, EvalParameters, Results, Evaluation} = require('./types')

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
      evaluationResult = module.exports.compareWithPrevious(currentBenchmark, completeBenchData, completeConfig, false);
      break;
    case 'previous_successful':
      evaluationResult = module.exports.compareWithPrevious(currentBenchmark, completeBenchData, completeConfig, true);
      break;
    case 'threshold_range':
      evaluationResult = module.exports.evaluateWithThresholdRanges(currentBenchmark, completeConfig.evaluationConfig);
      break;
    case 'jump_detection':
        evaluationResult = module.exports.evaluateWithJumpDetection(currentBenchmark, completeConfig);
        break;
    case 'trend_detection_moving_ave':
        evaluationResult = module.exports.trendDetectionMovingAve(currentBenchmark, completeConfig);
        break;
    case 'trend_detection_deltas':
        evaluationResult = module.exports.trendDetectionDeltas(currentBenchmark, completeConfig);
        break;
    default:
      throw new Error(`Unsupported evaluation method: ${completeConfig.evaluationConfig.evaluationMethod}`);
  }
  console.log(evaluationResult);
  return evaluationResult;
}

module.exports.evaluateWithThreshold = function (currentBenchmarkData, evaluationConfig) {
  //core.debug('Evaluating current benchmark with threshold method')
  //core.debug('Current benchmark data: ' + JSON.stringify(currentBenchmarkData))
  const { comparisonOperators, comparisonMargins, thresholdValues } = evaluationConfig;

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



  return module.exports.createEvaluationObject({
    "evaluation_method": "threshold",
    "metric_names": metricNames,
    "metric_units": metricUnits,
    "is": actualValues,
    "should_be": shouldBe,
    "than": thanValues,
    "result": evaluationResults,
    "reference_benchmarks": {
      "current": currentBenchmarkData
    }
  });

};

module.exports.compareWithPrevious = function (currentBenchmarkData, completeBenchData, completeConfig, successful) {
  const previousBenchmarkData = getLatestBenchmark(completeConfig.benchToCompare,
      completeConfig.folderWithBenchData, completeConfig.fileWithBenchData, 1, successful);
  // First, find the previous benchmark => we will get obj not json
  //core.debug('Previous benchmark data: ' + JSON.stringify(previousBenchmarkData));

  const { comparisonOperators, comparisonMargins } = completeConfig.evaluationConfig;

  const metricNames = [];
  const metricUnits = [];
  const actualValues = [];
  const shouldBe = [];
  const thanValues = [];
  const evaluationResults = [];

  const previousResultsMap = new Map(previousBenchmarkData.simpleMetricResults.map(
      result => [result.name, result]));

  currentBenchmarkData.simpleMetricResults.forEach((result, index) => {
    const currentName = result.name;
    const currentValue = result.value;
    actualValues.push(currentValue);
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

  const evaluationMethod = successful ? "previous_successful" : "previous";
  return module.exports.createEvaluationObject(
      {
        "evaluation_method": evaluationMethod,
        "metric_names": metricNames,
        "metric_units": metricUnits,
        "is": actualValues,
        "should_be": shouldBe,
        "than": thanValues,
        "result": evaluationResults,
        "reference_benchmarks": {
          "current": currentBenchmarkData,
          "previous": previousBenchmarkData
        }
      }
  );
};

module.exports.evaluateWithThresholdRanges = function (currentBenchmarkData, config) {
  //core.debug('Evaluating current benchmark with threshold ranges method')
  const { thresholdLower, thresholdUpper } = config;

  const metricNames = [];
  const metricUnits = [];
  const actualValues = [];
  const shouldBeBetween = [];
  const evaluationResults = [];

  currentBenchmarkData.simpleMetricResults.forEach((result, index) => {
    const value = result.value;
    const lowerThreshold = thresholdLower[index];
    const upperThreshold = thresholdUpper[index];

    metricNames.push(result.name);
    metricUnits.push(result.unit);
    actualValues.push(value);
    shouldBeBetween.push(`[${lowerThreshold}, ${upperThreshold}]`);

    const isPassed = value >= lowerThreshold && value <= upperThreshold;
    evaluationResults.push(isPassed ? 'passed' : 'failed');
  });

  return module.exports.createEvaluationObject(
      {
        "evaluation_method": "threshold_range",
        "metric_names": metricNames,
        "metric_units": metricUnits,
        "is": actualValues,
        "should_be": shouldBeBetween,
        "result": evaluationResults,
        "reference_benchmarks": {
          "current": currentBenchmarkData
        }
      }
  );
};

module.exports.evaluateWithJumpDetection = function (currentBenchmarkData, config) {

  const previousBenchmarkData = getLatestBenchmark(config.benchToCompare,
      config.folderWithBenchData, config.fileWithBenchData, 1, false);

  const { jumpDetectionThresholds } = config.evaluationConfig;
  //core.debug('Jump detection thresholds: ' + JSON.stringify(jumpDetectionThresholds));

  const map = new Map(
      previousBenchmarkData.simpleMetricResults.map(item => [item.name, { value: item.value, unit: item.unit }]));

  const metricNames = [];
  const metricUnits = [];
  const ratios = [];
  const shouldBe = [];
  const evaluationResults = [];

  currentBenchmarkData.simpleMetricResults.forEach((result, index) => {
    //core.debug('Current benchmark data jump det: ' + JSON.stringify(result));
    const currentName = result.name;
    const currentValue = result.value;
    const previousResult = map.get(currentName);
    const threshold = jumpDetectionThresholds[index];

    metricNames.push(currentName);
    metricUnits.push(result.unit);
    shouldBe.push(threshold);

    if (previousResult) {
      const ratio = (currentValue / previousResult.value - 1) * 100;
      ratios.push(ratio.toFixed(2));
      const isPassed = Math.abs(ratio) < threshold;
      evaluationResults.push(isPassed ? 'passed' : 'failed');
    } else {
      ratios.push('N/A');
      evaluationResults.push('N/A');
    }
  });

  return module.exports.createEvaluationObject({
    "evaluation_method": "jump_detection",
    "metric_names": metricNames,
    "metric_units": metricUnits,
    "is": ratios,
    "should_be": shouldBe,
    "result": evaluationResults,
    "reference_benchmarks": {
      "current": currentBenchmarkData,
      "previous": previousBenchmarkData
    }
  });
};

module.exports.trendDetectionMovingAve = function (currentBenchmarkData, completeConfig) {

  const { trendThresholds: t, movingAveWindowSize: b } = completeConfig.evaluationConfig;

  // First get the previous b benchmarks
  const previousBenchmarkDataArray = getNLatestBenchmarks(completeConfig.evaluationConfig.benchToCompare,
        completeConfig.folderWithBenchData, completeConfig.fileWithBenchData, b, false);
  //core.debug('Retrieved the following number of benchmarks: ' + previousBenchmarkDataArray.length);

  const metricNames = [];
  const evaluationResults = [];
  const metricUnits = [];
  const percentageIncreases = [];
  const should_be = [];

  currentBenchmarkData.simpleMetricResults.forEach((currentResult, index) => {
    const currentThreshold = t[index];
    should_be.push(currentThreshold);
    const currentName = currentResult.name;
    const currentValue = currentResult.value;
    metricNames.push(currentName);
    metricUnits.push(currentResult.unit);

    const previousMetrics = previousBenchmarkDataArray
        .map(build => build.simpleMetricResults.find(result => result.name === currentName))
        .filter(Boolean)

    //core.debug(`Number of benchmarks that have the current metric: ${previousMetrics.length}`);

    const sumOfPreviousMetrics = previousMetrics.reduce((acc, metric) => acc + metric.value, 0);
    const movingAverage = sumOfPreviousMetrics / Math.min(b, previousMetrics.length);

    const percentageIncrease = (currentValue / movingAverage - 1) * 100;
    percentageIncreases.push(percentageIncrease.toFixed(2));
    const isPassed = currentThreshold >= percentageIncrease;
    evaluationResults.push(isPassed ? 'passed' : 'failed');
  });

  return module.exports.createEvaluationObject({
    "evaluation_method": "trend_detection_moving_ave",
    "metric_names": metricNames,
    "metric_units": metricUnits,
    "is": percentageIncreases,
    "should_be": should_be,
    "result": evaluationResults,
    "reference_benchmarks": {
        "previous": previousBenchmarkDataArray,
        "current": currentBenchmarkData
    }
  });
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

module.exports.trendDetectionDeltas = function (currentBenchmarkData, config) {

  //core.debug('Current benchmark data: ' + JSON.stringify(currentBenchmarkData));

  const previousBenchmarkData = getLatestBenchmark(config.evaluationConfig.benchToCompare,
        config.folderWithBenchData, config.fileWithBenchData, 1, false);
  ////core.debug('Previous benchmark data: ' + JSON.stringify(previousBenchmarkData));

  const benchFromWeekAgo = getBenchFromWeekAgo(config.evaluationConfig.benchToCompare,
        config.folderWithBenchData, config.fileWithBenchData);
    ////core.debug('Bench from week ago: ' + JSON.stringify(benchFromWeekAgo));

  const lastStableReleaseBench = getBenchmarkOfStableBranch(
        config.evaluationConfig.benchToCompare, config.folderWithBenchData,
      config.fileWithBenchData, config.latestBenchSha);
    ////core.debug('Last stable release bench: ' + JSON.stringify(lastStableReleaseBench));


  const { trendThresholds: X } = config.evaluationConfig;

  const metricNames = [];
  const evaluationResults = [];
  const metricUnits = [];
  const failedExplanations = [];
  const metricToDifferentBenchValues = new Map();

  const calculatePercentageChange = (oldValue, newValue) => {
    return ((newValue - oldValue) / oldValue) * 100;
  };

  const evaluateChange = (oldValue, newValue, threshold) => {
    const percentageChange = calculatePercentageChange(oldValue, newValue);
    return Math.abs(percentageChange) <= threshold;
  };

  currentBenchmarkData.simpleMetricResults.forEach((currentResult, index) => {
    //core.debug('Current metric: ' + JSON.stringify(currentResult));
    const currentName = currentResult.name;
    const currentValue = currentResult.value;
    const currentUnit = currentResult.unit;
    metricUnits.push(currentUnit);
    const currentThreshold = X[index];
    const previousMetric = previousBenchmarkData.simpleMetricResults.find(r => r.name === currentName)?.value;
    const weekAgoMetric = benchFromWeekAgo.simpleMetricResults.find(r => r.name === currentName)?.value;
    const lastStableMetric = lastStableReleaseBench.simpleMetricResults.find(r => r.name === currentName)?.value;

    metricNames.push(currentName);

    const isPassedPrevious = previousMetric === undefined || evaluateChange(previousMetric, currentValue, currentThreshold);
    const isPassedWeekAgo = weekAgoMetric === undefined || evaluateChange(weekAgoMetric, currentValue, currentThreshold);
    const isPassedLastStable = lastStableMetric === undefined || evaluateChange(lastStableMetric, currentValue, currentThreshold);

    metricToDifferentBenchValues.set(currentName, {
        "current": currentValue,
        "previous": previousMetric,
        "week_ago": weekAgoMetric,
        "last_stable_release": lastStableMetric
    });


    const isPassed = isPassedPrevious && isPassedWeekAgo && isPassedLastStable;
    evaluationResults.push(isPassed ? 'passed' : 'failed');
    if (!isPassed) {
      const failedExplanation = `benchmark failed for the metric ${currentName}
      because one of the reference benchmarks failed to be within the threshold: ${X[index]}
      or there is no data for the reference benchmark`;
      failedExplanations.push(failedExplanation);
    } else {
      failedExplanations.push('N/A');
    }

  });

  return module.exports.createEvaluationObject({
    "evaluation_method": "trend_detection_deltas",
    "metric_names": metricNames,
    "metric_units": metricUnits,
    "result": evaluationResults,
    "failed_explanations": failedExplanations,
    "reference_benchmarks": {
      "current": currentBenchmarkData,
      "previous": previousBenchmarkData,
      "week_ago": benchFromWeekAgo,
      "last_stable_release": lastStableReleaseBench
    },
    "metric_to_different_bench_values": metricToDifferentBenchValues
  });
};

module.exports.createEvaluationObject = function(data) {
  const results = new Results(data.result);
  const evalParameters = new EvalParameters(
      data.evaluation_method,
      data.metric_names,
      data.metric_units,
      {
        failed_explanations: data.failed_explanations,
        metric_to_different_bench_values: data.metric_to_different_bench_values,
        is: data.is,
        should_be: data.should_be,
        than: data.than
      }
  );

  let referenceBenchmarks = null;
  if (data.reference_benchmarks) {
    referenceBenchmarks = new ReferenceBenchmarks(
        data.reference_benchmarks.current,
        data.reference_benchmarks.previous,
        data.reference_benchmarks.week_ago,
        data.reference_benchmarks.last_stable_release
    );
  }

  return new Evaluation(results, evalParameters, referenceBenchmarks);
}

