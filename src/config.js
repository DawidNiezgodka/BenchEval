const core = require('@actions/core')
const fs = require('fs')
const { Config, EvaluationConfig} = require('./types')
const {getCompleteBenchData} = require('./bench_data')
const path = require("path");

module.exports.determineJsonItemCount = function (json) {
  if (Array.isArray(json)) {
    return json.length
  }

  if (json && typeof json === 'object') {
    return 1
  }

  throw new Error(`Invalid JSON: ${json}`)
}

module.exports.getBoolInput = function (inputName) {
  const input = core.getInput(inputName)
  if (!input) {
    return false
  }
  if (input !== 'true' && input !== 'false') {
    throw new Error(
      `'${inputName}' input must be boolean value 'true' or 'false' but got '${input}'`
    )
  }
  return input === 'true'
}

module.exports.validateInputAndFetchConfig = function () {
  // Part 1: General info + extracting json with current bench data
  const benchName = core.getInput('name')
  const currentBenchResFileOrFolder = core.getInput('current_bench_res_file_or_folder')
  if (currentBenchResFileOrFolder === '') {
    throw new Error(
        `current_bench_res_file_or_folder must not be empty.`
    );
  }
  module.exports.isValidPath(currentBenchResFileOrFolder);
  let isFolder = module.exports.checkIfResultInFolder(currentBenchResFileOrFolder);
  let parsedData;
  let subsetParsedData;
  let itemCount;
  let rawData;
  const metricsToEvaluate = core.getInput('metrics_to_evaluate')

  if (isFolder) {
      console.log('Merging results from multiple files')
      const fileWhereMergedResultsWillBeSaved = currentBenchResFileOrFolder + '/merged_results.json';
      const mergingStrategies = core.getInput('result_files_merge_strategy_for_each_metric');
      const mergingStrategiesParsed = mergingStrategies.split(',').map(s => s.trim());
      module.exports.mergeResults(currentBenchResFileOrFolder, mergingStrategiesParsed,
          fileWhereMergedResultsWillBeSaved);
      console.log("After execution of mergeResulsts")
      rawData = fs.readFileSync(fileWhereMergedResultsWillBeSaved);
      console.log("Raw data: ", rawData)
      parsedData = JSON.parse(rawData);
      console.log("Parsed data: ", parsedData)
      subsetParsedData = parsedData;
      itemCount = module.exports.determineJsonItemCount(parsedData.results)

  } else {
    rawData = fs.readFileSync(currentBenchResFileOrFolder)
    parsedData = JSON.parse(rawData);
    if (metricsToEvaluate) {
      const inputMetrics = metricsToEvaluate.split(',').map(metric => metric.trim());
      const fileMetrics = parsedData.results.map(result => result.name);
      const isValidSubset = module.exports.areMetricsValid(inputMetrics, fileMetrics);
      if (!isValidSubset) {
        throw new Error(
            `Invalid metrics_to_evaluate: ${metricsToEvaluate}. Valid metrics are: ${fileMetrics.join(
                ', '
            )}`
        )
      }
      subsetParsedData = module.exports.filterMetrics(parsedData, metricsToEvaluate);
      itemCount = module.exports.determineJsonItemCount(subsetParsedData.results)
    } else {
      itemCount = module.exports.determineJsonItemCount(parsedData.results)
    }
  }


  const failingCondition = core.getInput('failing_condition')
  if (
      failingCondition !== 'any' &&
      failingCondition !== 'all' &&
      failingCondition !== 'none'
  ) {
    throw new Error(
        `Invalid failing condition: ${failingCondition}. Valid values are: any, all, none`
    )
  }

  // Part 3: Get and validate the benchmark to compare; if not specified, use the current benchmark
  let benchToCompare = core.getInput('bench_to_compare')
  if (benchToCompare === '' || benchToCompare === null) {
    benchToCompare = benchName
  }

  const folderWithBenchData = core.getInput('folder_with_bench_data')
  const fileWithBenchData = core.getInput('file_with_bench_data')
  // Part 4 (new): Check if evaluation_method is valid and carry out validation for this specific method
  const evalConfig = module.exports.validateAndFetchEvaluationConfig(
      itemCount, benchToCompare, folderWithBenchData, fileWithBenchData);

  // No need for extra validaiton
  const githubToken = core.getInput('github_token')

  // Variables concerning git repo manipulations
  const addComment = module.exports.validateAndGet('comment_to_commit')
  const addJobSummary = module.exports.validateAndGet('action_page_job_summary')
  const saveCurrBenchRes = module.exports.getBoolInput('save_curr_bench_res')

  const alertUsersIfBenchFailed = module.exports.validateUsersToBeAlerted()

  const linkToTemplatedGhPageWithResults = module.exports.validateLinkToTemplatedGhPageWithResults();


  return new Config(
      benchName,
      parsedData,
      subsetParsedData,
      failingCondition,
      benchToCompare,
      evalConfig,
      folderWithBenchData,
      fileWithBenchData,
      githubToken,
      addComment,
      addJobSummary,
      saveCurrBenchRes,
      alertUsersIfBenchFailed,
      linkToTemplatedGhPageWithResults
  )
}

module.exports.checkIfResultInFolder = function (currentBenchResFileOrFolder) {
    let wasMerged = false;
    if (currentBenchResFileOrFolder.endsWith('.json')) {
        wasMerged = false;
    } else {
        wasMerged = true;
    }
    return wasMerged;
}

module.exports.isValidPath = function(p) {
  const folderRegex = /^[a-zA-Z0-9_\/]+$/;
  const jsonFileRegex = /^[a-zA-Z0-9_\/]+\.json$/;
  return folderRegex.test(p) || jsonFileRegex.test(p);
}


module.exports.validateLinkToTemplatedGhPageWithResults = function () {
    const linkToTemplatedGhPageWithResults = core.getInput('link_to_templated_gh_page_with_results');
    // link must be https and have github.io in it
    if (linkToTemplatedGhPageWithResults !== '') {
        if (!linkToTemplatedGhPageWithResults.startsWith('https://')) {
            throw new Error(`Link to templated gh page must start with 'https://' but got '${linkToTemplatedGhPageWithResults}'`);
        }
        if (!linkToTemplatedGhPageWithResults.includes('github.io')) {
            throw new Error(`Link to templated gh page must contain 'github.io' but got '${linkToTemplatedGhPageWithResults}'`);
        }
    }
    console.log(linkToTemplatedGhPageWithResults);
    return linkToTemplatedGhPageWithResults;
}

module.exports.areMetricsValid = function(metricsToCheck, availableMetrics) {
  return metricsToCheck.every(metric => availableMetrics.includes(metric));
}

module.exports.filterMetrics = function(parsedData, metricsToEvaluate) {
  let subsetData = {...parsedData};
  subsetData.results = parsedData.results.filter(metric => metricsToEvaluate.includes(metric.name));
  return subsetData;
}

module.exports.validateUsersToBeAlerted = function () {
  let alertUsersIfBenchFailed = core.getInput('alert_users_if_bench_failed');
  console.log("Usaers", alertUsersIfBenchFailed);
  if (alertUsersIfBenchFailed !== '') {
    alertUsersIfBenchFailed = alertUsersIfBenchFailed.split(',').map(u => u.trim());
    for (const u of alertUsersIfBenchFailed) {
      if (!u.startsWith('@')) {
        throw new Error(`User name in 'alert_users_if_bench_failed' input must start with '@' but got '${u}'`);
      }
    }
  }
    return alertUsersIfBenchFailed;
}

module.exports.validateAndGet = function (inputName) {
    const input = core.getInput(inputName);
  // check if input is either "on", "off", or "if_failed"
    if (input !== 'on' && input !== 'off' && input !== 'if_failed') {
        throw new Error(
            `'${inputName}' input must be either 'on', 'off', or 'if_failed' but got '${input}'`
        )
    }
    return input
}

module.exports.camelToSnake = function (string) {
  return string
      .replace(/\w([A-Z])/g, function (m) {
        return m[0] + '_' + m[1]
      })
      .toLowerCase()
}

module.exports.validateAndFetchEvaluationConfig = function (currentResultLength, benchToCompare,
                                                            folderWithBenchData, fileWithBenchData) {
  // Evaluation method
  const evaluationMethod = core.getInput('evaluation_method', { required: true })
  const validEvaluationMethods = [
    'threshold',
    'previous',
    'previous_successful',
    'threshold_range',
    'jump_detection',
    'trend_detection_moving_ave',
    'trend_detection_deltas'
  ]
  if (!validEvaluationMethods.includes(evaluationMethod)) {
    throw new Error(
        `Invalid evaluation method: ${evaluationMethod}. Must be one of ${validEvaluationMethods.join(
            ', '
        )}`
    )
  }

  let benchmarkData = getCompleteBenchData(folderWithBenchData, fileWithBenchData);
  switch (evaluationMethod) {
    case 'threshold':
      console.log('Validating threshold evaluation configuration.')
      module.exports.validateOperatorsAndMargins(currentResultLength)
      module.exports.validateThresholdConfig(currentResultLength)
      break
    case 'previous':
      console.log('Validating previous evaluation configuration.')
      module.exports.validateOperatorsAndMargins(currentResultLength)
      module.exports.checkIfNthPreviousBenchmarkExists(benchmarkData, benchToCompare, 1);
      break
    case 'previous_successful':
      console.log('Validating previous successful evaluation configuration.')
      module.exports.validateOperatorsAndMargins(currentResultLength)
      module.exports.checkIfPreviousSuccessfulExists(benchmarkData, benchToCompare);
      break
    case 'threshold_range':
      console.log('Validating threshold range evaluation configuration.')
      module.exports.validateThresholdRangeConfig(currentResultLength)
      break
    case 'jump_detection':
      console.log('Validating jump detection evaluation configuration.')
      module.exports.checkIfNthPreviousBenchmarkExists(benchmarkData, benchToCompare, 1);
      module.exports.validateJumpDetectionConfig(currentResultLength)
      break
    case 'trend_detection_moving_ave':
      console.log('Validating trend detection with moving average evaluation configuration.')
      module.exports.validateTrendDetectionMovingAveConfig(currentResultLength)
      const movingAveWindowSize = core.getInput('moving_ave_window_size')
        try {
          module.exports.checkIfNthPreviousBenchmarkExists(benchmarkData, benchToCompare,
              movingAveWindowSize);
        } catch (error) {
          // Depending on the value of the trend_det_no_sufficient_data_strategry input,
          // we either fail or use available data
          const noSufficientDataStrategy = core.getInput('trend_det_no_sufficient_data_strategy');
            if (noSufficientDataStrategy === 'fail') {
                throw error;
            } else if (noSufficientDataStrategy === 'use_available') {
                const numberOfBenchsForName = benchmarkData.entries[benchToCompare].length;
                const stringOfNumberOfBenchs= numberOfBenchsForName.toString();
                console.log(`Not enough data for trend detection with moving average. Using available data.`)
                process.env[`INPUT_MOVING_AVE_WINDOW_SIZE`] = stringOfNumberOfBenchs;
                const newVal = core.getInput('moving_ave_window_size');
              console.log(`New value for moving_ave_window: ${newVal}`)
            } else {
                throw new Error(`Invalid value for trend_det_no_sufficient_data_strategy: 
                ${noSufficientDataStrategy}. Valid values are: fail, use_available_data.`)
            }
        }


      break
    case 'trend_detection_deltas':
      module.exports.validateTrendThreshold(currentResultLength);
      module.exports.checkForWeekOldBenchmark(benchmarkData, benchToCompare);
      module.exports.checkIfNthPreviousBenchmarkExists(benchmarkData, benchToCompare,1);
      break
    default:
      throw new Error(
          `Unsupported evaluation method: ${evaluationMethod}`
      )
  }

  return module.exports.createEvaluationConfig(
      'evaluationMethod',
      'benchToCompare',
      'thresholdValues',
      'comparisonOperators',
      'comparisonMargins',
      'thresholdUpper',
      'thresholdLower',
      'jumpDetectionThresholds',
      'trendThresholds',
      'movingAveWindowSize',
      'trendDetNoSufficientDataStrategy',
  )
}

module.exports.createEvaluationConfig = function (...inputNames) {
  const validInputs = [
    "evaluationMethod",
    "benchToCompare",
    "thresholdValues",
    "comparisonOperators",
    "comparisonMargins",
    "thresholdUpper",
    "thresholdLower",
    "jumpDetectionThresholds",
    "trendThresholds",
    "movingAveWindowSize",
    "trendDetNoSufficientDataStrategy"
  ]

  const configValues = validInputs.map(inputName => {
    if (inputNames.includes(inputName)) {
      const snakeCaseInputName = module.exports.camelToSnake(inputName)
      const inputValue = core.getInput(snakeCaseInputName)
      console.log(`Input value for ${snakeCaseInputName}: ${inputValue}`)
      if (inputValue) {
        if (inputName === 'comparisonOperators') {
            return inputValue.split(',').map(operator => operator.trim())
        }
        if (inputName === 'evaluationMethod' || inputName === 'benchToCompare'
        || inputName === 'trendDetNoSufficientDataStrategy') {
          return inputValue
        }
        return inputValue.includes(',')
            ? inputValue.split(',').map(Number)
            : Number(inputValue)
      }
    }
    return null
  })

  return new EvaluationConfig(...configValues)
}

module.exports.validateOperatorsAndMargins = function (currentResultLength) {
  console.log('Validating operators and margins')
  const comparisonOperatorsInput = core.getInput('comparison_operators')
  const comparisonMarginsInput = core.getInput('comparison_margins')

  if (!comparisonOperatorsInput || !comparisonMarginsInput) {
    throw new Error('Comparison operators and margins must not be null.')
  }
  const comparisonOperators = comparisonOperatorsInput.split(',')
  const comparisonMargins = comparisonMarginsInput.split(',').map(Number)
  if (comparisonOperators.length !== currentResultLength) {
    throw new Error(
        `The number of comparison operators must be equal to ${currentResultLength}.`
    )
  }
  if (comparisonMargins.length !== currentResultLength) {
    throw new Error(
        `The number of comparison margins must be equal to ${currentResultLength}.`
    )
  }
  const validOperators = ['smaller', 'bigger', 'tolerance']
  comparisonOperators.forEach(operator => {
    if (!validOperators.includes(operator.trim())) {
      throw new Error(
          `Invalid comparison operator: ${operator}. Valid operators are: ${validOperators.join(
              ', '
          )}.`
      )
    }
  })

  const validMargins = comparisonMargins.every(
      margin => margin === -1 || (margin >= 0 && margin <= 100)
  )
  if (!validMargins) {
    throw new Error('Comparison margins must be in the range [-1, 100].')
  }
}

module.exports.validateThresholdConfig = function (currentResultLength) {
  console.log('Validating threshold config')
  const thresholdValuesInput = core.getInput('threshold_values')
  const thresholdValues = thresholdValuesInput
      .split(',')
      .map(value => value.trim())

  if (thresholdValues.length !== currentResultLength) {
    throw new Error(
        `The number of threshold values (${thresholdValues.length}) must match the number of metrics (${currentResultLength}).`
    )
  }
}
module.exports.validateThresholdRangeConfig = function (currentResultLength) {
  const thresholdUpperInput = core.getInput('threshold_upper');
  const thresholdLowerInput = core.getInput('threshold_lower');

  if (!thresholdUpperInput || !thresholdLowerInput) {
    throw new Error(
        'Threshold range values are required for the threshold_range evaluation method.'
    );
  }

  const thresholdUpper = thresholdUpperInput.split(',').map(Number);
  const thresholdLower = thresholdLowerInput.split(',').map(Number);

  if (thresholdUpper.length !== thresholdLower.length) {
    throw new Error(
        'The number of upper thresholds must match the number of lower thresholds.'
    );
  }

  if (thresholdUpper.length !== currentResultLength) {
    throw new Error(
        'The number of thresholds must match the number of results.'
    );
  }

  for (let i = 0; i < thresholdUpper.length; i++) {
    if (thresholdUpper[i] < 0 || thresholdLower[i] < 0) {
      throw new Error(
          'Threshold values must be non-negative numbers.'
      );
    }

    if (thresholdUpper[i] <= thresholdLower[i]) {
      throw new Error(
          'Each upper threshold must be greater than its corresponding lower threshold.'
      );
    }
  }
}

module.exports.validateJumpDetectionConfig = function (currentResultLength) {
  const jumpDetectionThresholdsInput = core.getInput('jump_detection_thresholds')

  if (jumpDetectionThresholdsInput.trim() === '') {
    throw new Error('Jump detection threshold must be provided.')
  }

  const jumpDetectionThresholds = jumpDetectionThresholdsInput.split(',').map(Number)

  if (jumpDetectionThresholds.length !== currentResultLength) {
    throw new Error(
        'The number of jump det thresholds must match the number metrics.'
    )
  }
  jumpDetectionThresholds.forEach(value => {
    if (value < 0 || value > 100) {
      throw new Error(`Value ${value} is out of range [0,100]`);
    }
  });

  return jumpDetectionThresholds
}

module.exports.validateTrendThreshold = function (currentResultLength) {
  const trendThresholds = core.getInput('trend_thresholds')

  if (trendThresholds == null) {
    throw new Error(
        'Both movingAveWindowSize and trendThresholds must be provided for trend detection with moving average.'
    )
  }

  const movingAveThresholdValue = trendThresholds.split(',').map(Number)

  if (movingAveThresholdValue.length !== currentResultLength) {
    throw new Error(
        'The number of upper thresholds must match the number metrics.'
    )
  }
  movingAveThresholdValue.forEach(value => {
    if (value < 0 || value > 100) {
      throw new Error(`Value ${value} is out of range [0,100]`);
    }
  });
}

module.exports.validateTrendDetectionMovingAveConfig = function (currentResultLength) {
  validateTrendThreshold(currentResultLength);

  // window size part
  const movingAveWindowSize = core.getInput('moving_ave_window_size')
  if (movingAveWindowSize == null) {
    throw new Error(
        'Both movingAveWindowSize must be provided for trend detection with moving average.'
    )
  }

}

module.exports.checkIfNthPreviousBenchmarkExists = function (
    benchmarkData,
    benchmarkName,
    numberOfBenchmarks
) {
  console.log(
        `Checking if benchmark "${benchmarkName}" has ${numberOfBenchmarks} previous entries.`
    )

  if (!benchmarkData.entries.hasOwnProperty(benchmarkName)) {
    throw new Error(`No benchmarks found with the name "${benchmarkName}"`)
  }

  const benchmarks = benchmarkData.entries[benchmarkName]

  benchmarks.sort((a, b) => b.date - a.date)

  if (numberOfBenchmarks <= 0 || numberOfBenchmarks > benchmarks.length) {
    throw new Error(
        `Cannot return ${numberOfBenchmarks} previous benchmark(s) - insufficient data.`
    )
  }
}

module.exports.checkIfPreviousSuccessfulExists = function(data, benchmarkKey) {
  console.log(`Checking if previous successful benchmark exists under '${benchmarkKey}'`)
  if (!data.entries.hasOwnProperty(benchmarkKey)) {
    throw new Error(`No such benchmark key: '${benchmarkKey}' exists.`);
  }

  let benchmarks = data.entries[benchmarkKey];
  let successfulBenchmarkExists = benchmarks.some(benchmark => benchmark.benchSuccessful);

  if (successfulBenchmarkExists) {
    console.log(`A previous successful benchmark under '${benchmarkKey}' exists.`);
  } else {
    console.log(`No successful benchmark under '${benchmarkKey}' exists.`);
  }
}

module.exports.validateTrendDetectionDeltasConfig = function () {
  const trendThresholds = core.getInput('trend_thresholds')

  if (trendThresholds == null) {
    throw new Error(
        'trendThresholds must be provided for trend detection.'
    )
  }

  const trendThresholdsNum = Number(trendThresholds)
  if (
      isNaN(trendThresholdsNum) ||
      trendThresholdsNum < 0 ||
      trendThresholdsNum > 100
  ) {
    throw new Error('trendThresholds must be a number between 0 and 100.')
  }
}

module.exports.checkForWeekOldBenchmark = function(data, benchmarkKey) {


  const ONE_WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;
  const DAY_IN_MS = 24 * 60 * 60 * 1000;
  const now = Date.now();


  if (!data.entries.hasOwnProperty(benchmarkKey)) {
    throw new Error(`No such benchmark key: '${benchmarkKey}' exists.`);
  }

  let benchmarks = data.entries[benchmarkKey];
  // print number of benchmarks


  let weekOldBenchmarkExists = benchmarks.some(benchmark => {


    let benchmarkAge = now - benchmark.date;
    return benchmarkAge >= (ONE_WEEK_IN_MS - DAY_IN_MS) && benchmarkAge <= (ONE_WEEK_IN_MS + DAY_IN_MS);
  });

  if (!weekOldBenchmarkExists) {
    throw new Error(`No benchmark under '${benchmarkKey}' is approximately one week old.`);
  } else {
    console.log(`A benchmark under '${benchmarkKey}' is approximately one week old.`);
  }
}


module.exports.mergeResults = function(directory, strategies, outputFile, metricsToEvaluate) {
  const validStrategies = ['sum', 'average', 'min', 'max', 'median'];

  let evaluatedMetrics;
  let mergeAllMetrics = false;

  if (metricsToEvaluate) {
    evaluatedMetrics = metricsToEvaluate.split(',').map(metric => metric.trim());
    if (evaluatedMetrics.length !== strategies.length) {
      throw new Error('The number of metrics in metricsToEvaluate does not match the number of provided strategies');
    }
  } else {
    mergeAllMetrics = true;
  }

  const files = fs.readdirSync(directory);
  let mergedData = {};
  let metricsValues = new Map();

  files.forEach((file, fileIndex) => {
    const content = fs.readFileSync(path.join(directory, file), 'utf8');
    const result = JSON.parse(content);

    if (fileIndex === 0) {
      mergedData = {...result};
      mergedData.results = [];

      if (mergeAllMetrics) {
        result.results.forEach((metric, index) => {
          mergedData.results.push({ ...metric, value: [] });
          metricsValues.set(metric.name, []);
        });
      } else {
        evaluatedMetrics.forEach((metricName) => {
          const metric = result.results.find(r => r.name === metricName);
          if (metric) {
            mergedData.results.push({ ...metric, value: [] });
            metricsValues.set(metricName, []);
          } else {
            throw new Error(`Metric ${metricName} not found in the results`);
          }
        });
      }
    }

    result.results.forEach((metric) => {
      if (mergeAllMetrics || evaluatedMetrics.includes(metric.name)) {
        metricsValues.get(metric.name).push(metric.value);
      }
    });
  });

  mergedData.results.forEach((metric, index) => {
    const strategy = mergeAllMetrics ? strategies[index] : strategies[evaluatedMetrics.indexOf(metric.name)];
    if (!validStrategies.includes(strategy)) {
      throw new Error(`Invalid strategy: ${strategy}. Valid strategies are sum, average, min, max, median.`);
    }
    const values = metricsValues.get(metric.name);
    metric.value = module.exports.applyStrategy(strategy, values);
  });

  console.log('Merged data: ', mergedData);
  console.log("Saving merged data to file: ", outputFile);

  fs.writeFileSync(outputFile, JSON.stringify(mergedData, null, 2));
}

module.exports.applyStrategy = function(strategy, values) {
  switch (strategy) {
    case 'sum':
      return values.reduce((a, b) => a + b, 0);
    case 'average':
      return values.reduce((a, b) => a + b, 0) / values.length;
    case 'min':
      return Math.min(...values);
    case 'max':
      return Math.max(...values);
    case 'median':
      return module.exports.calculateMedian(values);
    default:
      throw new Error('Invalid strategy');
  }
}

module.exports.calculateMedian = function(values) {
  const sortedValues = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sortedValues.length / 2);

  if (sortedValues.length % 2 === 0) {
    return (sortedValues[mid - 1] + sortedValues[mid]) / 2;
  } else {
    return sortedValues[mid];
  }
}



