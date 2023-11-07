const core = require('@actions/core')
const fs = require('fs')
const { Config } = require('./types')

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
  const benchName = core.getInput('name')

  const pathToCurBenchFile = core.getInput('current_bench_res_file')
  const rawData = fs.readFileSync(pathToCurBenchFile)
  const parsedData = JSON.parse(rawData)
  const itemCount = module.exports.determineJsonItemCount(parsedData.results)
  const benchType = core.getInput('bench_type')
  module.exports.validateBenchType(benchType)
  module.exports.validateItemCountForBenchType(itemCount, benchType)

  const folderWithBenchData = core.getInput('folder_with_bench_data')
  const fileWithBenchData = core.getInput('file_with_bench_data')
  const githubToken = core.getInput('github_token')

  const addComment = module.exports.getBoolInput('add_comment_to_commit')
  const addJobSummary = module.exports.getBoolInput('add_action_job_summary')
  const saveCurrBenchRes = module.exports.getBoolInput('save_curr_bench_res')
  const failingCondition = core.getInput('failing_condition')

  let benchToCompare = core.getInput('bench_to_compare')
  if (benchToCompare === '' || benchToCompare === null) {
    benchToCompare = benchName
  }
  const reference = core.getInput('reference')
  module.exports.validateReference(reference, benchToCompare, benchName)

  const thresholds = core.getInput('thresholds')
  let thresholdArray = []
  // if thresholds is empty or null and reference is 'threshold', throw error
  if (thresholds === '' || thresholds === null) {
    if (reference === 'threshold') {
      throw new Error(
        `Thresholds must be specified when reference is 'threshold'`
      )
    }
  } else {
    thresholdArray = module.exports.getCommaSepInputAsArray(thresholds)
    if (itemCount !== thresholdArray.length) {
      throw new Error(
        `Number of thresholds (${thresholdArray.length}) must be equal to number of items in JSON (${itemCount})`
      )
    }
  }

  const comparisonModesInput = core.getInput('comparison_modes')
  const comparisonModes =
    module.exports.getCommaSepInputAsArray(comparisonModesInput)
  if (itemCount !== comparisonModes.length) {
    throw new Error(`Number of threshold comparison modes (${comparisonModes.length})
         must be equal to number of items in JSON (${itemCount})`)
  }

  const comparisonMarginsInput = core.getInput('comparison_margins')
  const comparisonMargins = module.exports.getCommaSepInputAsArray(
    comparisonMarginsInput
  )
  if (itemCount !== comparisonMargins.length) {
    throw new Error(`Number of percentage threshold margins (${comparisonMargins.length})
         must be equal to number of items in JSON (${itemCount})`)
  }

  // validate failing condition. it should be one of: any, all, none
  if (
    failingCondition !== 'any' &&
    failingCondition !== 'all' &&
    failingCondition !== 'none'
  ) {
    throw new Error(
      `Invalid failing condition: ${failingCondition}. Valid values are: any, all, none`
    )
  }

  return new Config(
    benchName,
    parsedData,
    benchType,
    folderWithBenchData,
    fileWithBenchData,
    githubToken,
    addComment,
    addJobSummary,
    saveCurrBenchRes,
    reference,
    benchToCompare,
    thresholdArray,
    comparisonModes,
    comparisonMargins,
    failingCondition
  )
}

module.exports.camelToSnake = function (string) {
  return string
      .replace(/\w([A-Z])/g, function (m) {
        return m[0] + '_' + m[1]
      })
      .toLowerCase()
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
      const inputValue = getInput(snakeCaseInputName)

      if (inputValue) {
        // Check if the input contains commas, suggesting it's a list
        return inputValue.includes(',')
            ? inputValue.split(',').map(Number)
            : Number(inputValue)
      }
    }
    return null
  })

  return new EvaluationConfig(...configValues)
}

module.exports.validateAndFetchConfig = function (currentResultLength) {
  // Evaluation method
  const evaluationMethod = getInput('evaluation_method', { required: true })
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

  switch (evaluationMethod) {
    case 'threshold':
      module.exports.validateOperatorsAndMargins(currentResultLength)
      module.exports.validateThresholdConfig(currentResultLength)
      break
    case 'previous':
      module.exports.validateOperatorsAndMargins(currentResultLength)
      // checkIfPreviousNumberOfBenchmarksExists(1);
      break
    case 'previous_successful':
      module.exports.validateOperatorsAndMargins(currentResultLength)
      // checkIfPreviousNumberOfBenchmarksExists(1);
      break
    case 'threshold_range':
      module.exports.validateThresholdRangeConfig(currentResultLength)
      break
    case 'jump_detection':
      // checkIfPreviousNumberOfBenchmarksExists(1);
      module.exports.validateJumpDetectionConfig()
      break
    case 'trend_detection_moving_ave':
      module.exports.validateTrendDetectionMovingAveConfig()
      const movingAveWindowSize = getInput('moving_ave_window')
      // checkIfPreviousNumberOfBenchmarksExists(movingAveWindowSize);
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

module.exports.validateOperatorsAndMargins = function (currentResultLength) {
  // Retrieve the inputs as strings
  const comparisonOperatorsInput = getInput('comparisonOperators')
  const comparisonMarginsInput = getInput('comparisonMargins')

  // Validate that the inputs are not null
  if (!comparisonOperatorsInput || !comparisonMarginsInput) {
    throw new Error('Comparison operators and margins must not be null.')
  }

  // Convert the inputs into arrays
  const comparisonOperators = comparisonOperatorsInput.split(',')
  const comparisonMargins = comparisonMarginsInput.split(',').map(Number) // Convert margins to numbers for further validation

  // Validate the number of elements
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

  // Validate the values for operators
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

  // Validate the range for margins
  const validMargins = comparisonMargins.every(
      margin => margin === -1 || (margin >= 0 && margin <= 100)
  )
  if (!validMargins) {
    throw new Error('Comparison margins must be in the range [-1, 100].')
  }
}
module.exports.validateThresholdConfig = function (currentResultLength) {
  const thresholdValuesInput = getInput('threshold_values')
  const thresholdValues = thresholdValuesInput
      .split(',')
      .map(value => value.trim())

  // Validate the number of elements in each array
  if (thresholdValues.length !== currentResultLength) {
    throw new Error(
        `The number of threshold values (${thresholdValues.length}) must match the number of metrics (${currentResultLength}).`
    )
  }
}
module.exports.validateThresholdRangeConfig = function (currentResultLength) {
  const thresholdUpperInput = getInput('threshold_upper')
  const thresholdLowerInput = getInput('threshold_lower')

  if (!thresholdUpperInput || !thresholdLowerInput) {
    throw new Error(
        'Threshold range values are required for the threshold_range evaluation method.'
    )
  }

  // Convert the comma-separated string inputs into arrays of numbers
  const thresholdUpper = thresholdUpperInput.split(',').map(Number)
  const thresholdLower = thresholdLowerInput.split(',').map(Number)

  if (thresholdUpper.length !== thresholdLower.length) {
    throw new Error(
        'The number of upper thresholds must match the number of lower thresholds.'
    )
  }

  // Check if the length of the threshold arrays match the number of results
  if (thresholdUpper.length !== currentResultLength) {
    throw new Error(
        'The number of thresholds must match the number of results.'
    )
  }
}

module.exports.validateJumpDetectionConfig = function (currentResultLength) {
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
  // Destructuring the necessary properties from the config object
  const movingAveWindowSize = getInput('moving_ave_window_size')
  const movingAveThreshold = getInput('moving_ave_threshold')

  // Check if both movingAveWindowSize and movingAveThreshold are present
  if (movingAveWindowSize == null || movingAveThreshold == null) {
    throw new Error(
        'Both movingAveWindowSize and movingAveThreshold must be provided for trend detection with moving average.'
    )
  }

  // Use the checkIfPreviousNumberOfBenchmarksExists module.exports.to check the movingAveWindowSize
  if (!checkIfNthPreviousBenchmarkExists(benchmarkData, movingAveWindowSize)) {
    throw new Error(
        `The provided movingAveWindowSize of ${movingAveWindowSize} exceeds the number of available benchmarks.`
    )
  }

  // Validate movingAveThreshold to be within the range [0, 100]
  const movingAveThresholdValue = Number(movingAveThreshold)
  if (
      isNaN(movingAveThresholdValue) ||
      movingAveThresholdValue < 0 ||
      movingAveThresholdValue > 100
  ) {
    throw new Error('movingAveThreshold must be a number between 0 and 100.')
  }
}

