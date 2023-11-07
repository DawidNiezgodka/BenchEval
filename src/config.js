const core = require('@actions/core')
const fs = require('fs')
const { Config, EvaluationConfig} = require('./types')
const {getCompleteBenchData} = require('./bench_data')

module.exports.validateBooleanInput = function (input) {
  return input === 'true' || input === 'false'
}

module.exports.validateBenchType = function (benchmarkType) {
  const validTypes = ['simple', 'simple-multi', 'complex', 'complex-multi']
  if (!validTypes.includes(benchmarkType)) {
    throw new Error(`Invalid benchmark type: ${benchmarkType}`)
  }
}

module.exports.validateReference = function (
  reference,
  currentBenchName,
  benchToCompare
) {
  const validReferences = ['previous', 'threshold', 'previous-successful']

  if (currentBenchName !== benchToCompare) {
    const validReferences = ['previous', 'previous-successful']
    if (!validReferences.includes(reference)) {
      throw new Error(`Invalid reference: ${reference}`)
    }
  }

  if (!validReferences.includes(reference)) {
    throw new Error(`Invalid reference: ${reference}`)
  }
}

module.exports.determineJsonItemCount = function (json) {
  if (Array.isArray(json)) {
    return json.length
  }

  if (json && typeof json === 'object') {
    return 1
  }

  throw new Error(`Invalid JSON: ${json}`)
}

module.exports.validateItemCountForBenchType = function (itemCount, benchType) {
  if (benchType === 'simple' || benchType === 'complex') {
    return itemCount === 1
  } else if (benchType === 'simple-multi' || benchType === 'complex-multi') {
    return itemCount > 1
  } else {
    throw new Error(`Invalid benchType: ${benchType}`)
  }
}

module.exports.getCommaSepInputAsArray = function (inputString) {
  inputString = inputString.trim()
  if (inputString.includes(',')) {
    const array = inputString.split(',').map(str => str.trim())
    return array.filter(str => str !== '')
  } else {
    return [inputString]
  }
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

module.exports.convertSingleJsonObjectToArr = function (obj) {
  return [obj]
}

module.exports.validateInputAndFetchConfig = function () {
  // Part 1: General info + extracting json with current bench data
  const benchName = core.getInput('name')
  const pathToCurBenchFile = core.getInput('current_bench_res_file')
  const rawData = fs.readFileSync(pathToCurBenchFile)
  const parsedData = JSON.parse(rawData)
  const itemCount = module.exports.determineJsonItemCount(parsedData.results)

  const benchType = core.getInput('bench_type')
  module.exports.validateBenchType(benchType)
  module.exports.validateItemCountForBenchType(itemCount, benchType)

  // Part 2: Get and validate failing condition
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
  const evalConfig = module.exports.validateAndFetchConfig(
      itemCount, benchToCompare, folderWithBenchData, fileWithBenchData);

  // No need for extra validaiton
  const githubToken = core.getInput('github_token')

  // Variables concerning git repo manipulations
  const addComment = module.exports.getBoolInput('add_comment_to_commit')
  const addJobSummary = module.exports.getBoolInput('add_action_job_summary')
  const saveCurrBenchRes = module.exports.getBoolInput('save_curr_bench_res')


  return new Config(
      benchName,
      parsedData,
      benchType,
      failingCondition,
      benchToCompare,
      evalConfig,
      folderWithBenchData,
      fileWithBenchData,
      githubToken,
      addComment,
      addJobSummary,
      saveCurrBenchRes,
  )
}

module.exports.camelToSnake = function (string) {
  return string
      .replace(/\w([A-Z])/g, function (m) {
        return m[0] + '_' + m[1]
      })
      .toLowerCase()
}

module.exports.validateAndFetchConfig = function (currentResultLength, benchToCompare,
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
      module.exports.validateJumpDetectionConfig()
      break
    case 'trend_detection_moving_ave':
      console.log('Validating trend detection with moving average evaluation configuration.')
      module.exports.validateTrendDetectionMovingAveConfig()
      const movingAveWindowSize = core.getInput('moving_ave_window')
       module.exports.checkIfNthPreviousBenchmarkExists(benchmarkData, benchToCompare,
           movingAveWindowSize);
      break
    case 'trend_detection_deltas':
      //module.exports.validateTrendDetectionDeltasConfig()
      break
    default:
      throw new Error(
          `Unsupported evaluation method: ${config.evaluationMethod}`
      )
  }

  return module.exports.createEvaluationConfig(
      'evaluationMethod',
      'thresholdValues',
      'comparisonOperators',
      'comparisonMargins',
      'thresholdUpper',
      'thresholdLower',
      'jumpDetectionThreshold',
      'movingAveWindowSize',
      'movingAveThreshold',
      'deltasThreshold'
  )
}

module.exports.createEvaluationConfig = function (...inputNames) {
  const validInputs = [
    'evaluationMethod',
    'thresholdValues',
    'comparisonOperators',
    'comparisonMargins',
    'thresholdUpper',
    'thresholdLower',
    'jumpDetectionThreshold',
    'movingAveWindowSize',
    'movingAveThreshold',
    'deltasThreshold'
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
        if (inputName === 'evaluationMethod') {
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
  console.log('Validating threshold range config')
  const thresholdUpperInput = core.getInput('threshold_upper')
  const thresholdLowerInput = core.getInput('threshold_lower')

  if (!thresholdUpperInput || !thresholdLowerInput) {
    throw new Error(
        'Threshold range values are required for the threshold_range evaluation method.'
    )
  }

  const thresholdUpper = thresholdUpperInput.split(',').map(Number)
  const thresholdLower = thresholdLowerInput.split(',').map(Number)

  if (thresholdUpper.length !== thresholdLower.length) {
    throw new Error(
        'The number of upper thresholds must match the number of lower thresholds.'
    )
  }

  if (thresholdUpper.length !== currentResultLength) {
    throw new Error(
        'The number of thresholds must match the number of results.'
    )
  }
}

module.exports.validateJumpDetectionConfig = function () {
  const jumpDetectionThresholdInput = core.getInput('jump_detection_threshold')

  if (jumpDetectionThresholdInput.trim() === '') {
    throw new Error('Jump detection threshold must be provided.')
  }

  const jumpDetectionThreshold = Number(jumpDetectionThresholdInput.trim())

  if (isNaN(jumpDetectionThreshold)) {
    throw new Error('Jump detection threshold must be a valid number.')
  }

  if (jumpDetectionThreshold < 0 || jumpDetectionThreshold > 100) {
    throw new Error(
        'Jump detection threshold must be within the range [0, 100].'
    )
  }

  return jumpDetectionThreshold
}

module.exports.validateTrendDetectionMovingAveConfig = function () {
  const movingAveWindowSize = core.getInput('moving_ave_window_size')
  const movingAveThreshold = core.getInput('moving_ave_threshold')

  if (movingAveWindowSize == null || movingAveThreshold == null) {
    throw new Error(
        'Both movingAveWindowSize and movingAveThreshold must be provided for trend detection with moving average.'
    )
  }

  const movingAveThresholdValue = Number(movingAveThreshold)
  if (
      isNaN(movingAveThresholdValue) ||
      movingAveThresholdValue < 0 ||
      movingAveThresholdValue > 100
  ) {
    throw new Error('movingAveThreshold must be a number between 0 and 100.')
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



