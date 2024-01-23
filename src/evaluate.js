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
  return evaluationResult;
}

module.exports.evaluateWithThreshold = function (currentBenchmarkData, evaluationConfig) {
  const { comparisonOperators, comparisonMargins, thresholdValues } = evaluationConfig;

  const actualValues = [];
  const metricNames = [];
  const metricUnits = [];
  const shouldBe = [];
  const thanValues = [];
  const evaluationResults = [];

  currentBenchmarkData.simpleMetricResults.forEach((result, index) => {
    const value = result.value;
    const thresholdValue = thresholdValues[index];
    const margin = comparisonMargins[index];
    const operator = comparisonOperators[index];
    let isPassed;

    actualValues.push(value);
    metricNames.push(result.name);
    metricUnits.push(result.unit);

    let smallerBiggerText;
    if (margin < 0) {
      smallerBiggerText = `Strictly ${operator} than`;
    } else {
      smallerBiggerText = `At least ${margin} % ${operator} than`;
    }
    let toleranceText = `In symmetric range of ${margin} % to`;
    operator === 'tolerance' ? shouldBe.push(toleranceText) : shouldBe.push(smallerBiggerText);
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
  const previousBenchmarkData = getLatestBenchmark(completeConfig.benchmarkGroupToCompare,
      completeConfig.folderWithBenchData, completeConfig.fileWithBenchData, 1, successful);

  core.debug("------ compareWithPrevious [after fetching prev data] ------")
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

  core.debug('--- start evaluateWithThresholdRanges ---')
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

  core.debug('--- end evaluateWithThresholdRanges (before return) ---')
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
  const previousBenchmarkData = getLatestBenchmark(config.benchmarkGroupToCompare,
      config.folderWithBenchData, config.fileWithBenchData, 1, false);

  const { jumpDetectionThresholds } = config.evaluationConfig;
  const map = new Map(
      previousBenchmarkData.simpleMetricResults.map(item => [item.name, { value: item.value, unit: item.unit }]));

  const metricNames = [];
  const metricUnits = [];
  const ratios = [];
  const shouldBe = [];
  const evaluationResults = [];

  currentBenchmarkData.simpleMetricResults.forEach((result, index) => {
    const currentName = result.name;
    const currentValue = result.value;
    const previousResult = map.get(currentName);
    const threshold = jumpDetectionThresholds[index];

    metricNames.push(currentName);
    metricUnits.push(result.unit);
    shouldBe.push(threshold);

    if (previousResult) {
      const ratio = Math.abs((currentValue / previousResult.value - 1) * 100);
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
  const previousBenchmarkDataArray = getNLatestBenchmarks(completeConfig.evaluationConfig.benchmarkGroupToCompare,
        completeConfig.folderWithBenchData, completeConfig.fileWithBenchData, b, false);


  core.debug("------ trendDetectionMovingAve [after previousBenchmarkDataArray] ------")

  const metricNames = [];
  const evaluationResults = [];
  const metricUnits = [];
  const percentageIncreases = [];
  const should_be = [];

  core.debug("Printing fetched benchmarks")
  core.debug(JSON.stringify(previousBenchmarkDataArray));

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

    const sumOfPreviousMetrics = previousMetrics.reduce((acc, metric) => acc + metric.value, 0);
    const movingAverage = sumOfPreviousMetrics / Math.min(b, previousMetrics.length);

    const percentageIncrease = Math.abs((currentValue / movingAverage - 1) * 100);
    percentageIncreases.push(percentageIncrease.toFixed(2));
    const isPassed = currentThreshold >= percentageIncrease;
    evaluationResults.push(isPassed ? 'passed' : 'failed');
  });

  core.info(`Percentage increases: ${percentageIncreases}`)

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
  core.debug('--- start trendDetectionDeltas ---')
  const previousBenchmarkData = getLatestBenchmark(config.evaluationConfig.benchmarkGroupToCompare,
        config.folderWithBenchData, config.fileWithBenchData, 1, false);
  const benchFromWeekAgo = getBenchFromWeekAgo(config.evaluationConfig.benchmarkGroupToCompare,
        config.folderWithBenchData, config.fileWithBenchData);
  const lastStableReleaseBench = getBenchmarkOfStableBranch(
        config.evaluationConfig.benchmarkGroupToCompare, config.folderWithBenchData,
      config.fileWithBenchData, config.latestBenchSha);

  let { trendThresholds: X } = config.evaluationConfig;
  if (!Array.isArray(X)) {
        X = [X];
    }

  const metricNames = [];
  const evaluationResults = [];
  const metricUnits = [];
  const resultExplanations = [];
  const metricToDifferentBenchValues = new Map();

  const calculatePercentageChange = (oldValue, newValue) => {
    return ((newValue - oldValue) / oldValue) * 100;
  };

  const evaluateChange = (oldValue, newValue, threshold) => {
    const percentageChange = calculatePercentageChange(oldValue, newValue);
    return Math.abs(percentageChange) <= threshold;
  };

  currentBenchmarkData.simpleMetricResults.forEach((currentResult, index) => {
    const currentName = currentResult.name;
    const currentValue = currentResult.value;
    const currentUnit = currentResult.unit;
    metricUnits.push(currentUnit);
    const currentThreshold = X[index];
    const previousMetric = previousBenchmarkData.simpleMetricResults.find(r => r.name === currentName)?.value;
    const weekAgoMetric = benchFromWeekAgo.simpleMetricResults.find(r => r.name === currentName)?.value;
    const lastStableMetric = lastStableReleaseBench.simpleMetricResults.find(r => r.name === currentName)?.value;
    metricNames.push(currentName);

    const isPassedPrevious = previousMetric !== undefined && evaluateChange(previousMetric, currentValue, currentThreshold);
    const isPassedWeekAgo = weekAgoMetric !== undefined && evaluateChange(weekAgoMetric, currentValue, currentThreshold);
    const isPassedLastStable = lastStableMetric !== undefined && evaluateChange(lastStableMetric, currentValue, currentThreshold);

    metricToDifferentBenchValues.set(currentName, {
      "current": currentValue,
      "previous": previousMetric,
      "week_ago": weekAgoMetric,
      "last_stable_release": lastStableMetric
    });

    const isPassed = isPassedPrevious && isPassedWeekAgo && isPassedLastStable;
    evaluationResults.push(isPassed ? 'passed' : 'failed');

    const undefinedMetrics = [];
    if (previousMetric === undefined) undefinedMetrics.push('previous');
    if (weekAgoMetric === undefined) undefinedMetrics.push('week_ago');
    if (lastStableMetric === undefined) undefinedMetrics.push('last_stable_release');

    if (!isPassed || undefinedMetrics.length > 0) {
      let resultExplanation = `benchmark ${isPassed ? 'passed' : 'failed'} for the metric ${currentName}`;
      if (undefinedMetrics.length > 0) {
        resultExplanation += `, but there was undefined data for the following metric(s): ${undefinedMetrics.join(', ')}`;
      } else {
        resultExplanation += ` because one of the reference benchmarks failed to be within the threshold: ${X[index]}`;
      }
      resultExplanations.push(resultExplanation);
    } else {
      resultExplanations.push('N/A');
    }

  });

  core.debug('--- end trendDetectionDeltas ---')
  return module.exports.createEvaluationObject({
    "evaluation_method": "trend_detection_deltas",
    "metric_names": metricNames,
    "metric_units": metricUnits,
    "result": evaluationResults,
    "result_explanations": resultExplanations,
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
        result_explanations: data.result_explanations,
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

