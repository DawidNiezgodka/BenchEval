class CompleteBenchmark {
  constructor(
    benchmarkName,
    benchmarkInfo,
    simpleMetricResults,
    commitInfo,
    benchSuccessful
  ) {
    this.benchmarkName = benchmarkName
    this.benchmarkInfo = benchmarkInfo
    this.simpleMetricResults = simpleMetricResults
    this.commitInfo = commitInfo
    this.benchSuccessful = benchSuccessful
  }
}

class BenchmarkInfo {
  constructor(executionTime, parametrization, otherInfo) {
    this.executionTime = executionTime
    this.parametrization = parametrization
    this.otherInfo = otherInfo
  }
}

class SimpleMetricResult {
  constructor(name, value, unit) {
    this.name = name
    this.value = value
    this.unit = unit
  }
}

class Commit {
  constructor(author, committer, id, message, timestamp, url) {
    this.author = author
    this.committer = committer
    this.id = id
    this.message = message
    this.timestamp = timestamp
    this.url = url
  }
}

class Config {
  constructor(
    benchName,
    currBenchResJson,
    benchType,

    failingCondition,

    benchToCompare,

    evaluationConfig,

    folderWithBenchData,
    fileWithBenchData,
    githubToken,
    addComment,
    addJobSummary,
    saveCurrBenchRes,
  ) {
    this.benchName = benchName
    this.currBenchResJson = currBenchResJson
    this.benchType = benchType
    this.failingCondition = failingCondition
    this.benchToCompare = benchToCompare
    this.evaluationConfig = evaluationConfig
    this.folderWithBenchData = folderWithBenchData
    this.fileWithBenchData = fileWithBenchData
    this.githubToken = githubToken
    this.addComment = addComment
    this.addJobSummary = addJobSummary
    this.saveCurrBenchRes = saveCurrBenchRes

  }
}

class EvaluationConfig {

    constructor(
        evaluationMethod,
        benchToCompare,
        thresholdValues,
        comparisonOperators,
        comparisonMargins,
        thresholdUpper,
        thresholdLower,
        jumpDetectionThreshold,
        trendThreshold,
        movingAveWindowSize,
        trendDetNoSufficientDataStrategy
    ) {
        this.evaluationMethod = evaluationMethod
        this.benchToCompare = benchToCompare
        this.thresholdValues = thresholdValues
        this.comparisonOperators = comparisonOperators
        this.comparisonMargins = comparisonMargins
        this.thresholdUpper = thresholdUpper
        this.thresholdLower = thresholdLower
        this.jumpDetectionThreshold = jumpDetectionThreshold
        this.trendThreshold = trendThreshold
        this.movingAveWindowSize = movingAveWindowSize
        this.trendDetNoSufficientDataStrategy = trendDetNoSufficientDataStrategy
    }
}

module.exports = {
  CompleteBenchmark,
  SimpleMetricResult,
  Config,
  Commit,
  BenchmarkInfo,
  EvaluationConfig
}
