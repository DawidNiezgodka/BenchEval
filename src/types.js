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
        jumpDetectionThresholds,
        trendThresholds,
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
        this.jumpDetectionThresholds = jumpDetectionThresholds
        this.trendThresholds = trendThresholds
        this.movingAveWindowSize = movingAveWindowSize
        this.trendDetNoSufficientDataStrategy = trendDetNoSufficientDataStrategy
    }
}

class ReferenceBenchmarks {
    constructor(current, previous, weekAgo, lastStableRelease) {
        this.current = current;
        this.previous = previous;
        this.week_ago = weekAgo;
        this.last_stable_release = lastStableRelease;
    }
}

class EvalParameters {
    constructor(evaluationMethod, metricNames, metricUnits, options = {}) {
        this.evaluation_method = evaluationMethod;
        this.metric_names = metricNames;
        this.metric_units = metricUnits;


        this.failed_explanations = options.failed_explanations || [];
        this.metric_to_different_bench_values = options.metric_to_different_bench_values || {};
        this.is = options.is || [];
        this.should_be = options.should_be || [];
        this.than = options.than || [];
    }
}

class Results {
    constructor(result) {
        this.result = result;
    }
}

class Evaluation {
    constructor(results, evalParameters, referenceBenchmarks) {
        this.results = results;
        this.eval_parameters = evalParameters;
        this.reference_benchmarks = referenceBenchmarks;
    }
}

module.exports = {
  CompleteBenchmark,
  SimpleMetricResult,
  Config,
  Commit,
  BenchmarkInfo,
  EvaluationConfig,
    ReferenceBenchmarks,
    EvalParameters,
    Results,
    Evaluation
}
