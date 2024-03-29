const core = require('@actions/core')
const { promises: fs } = require('fs')
const fss = require('fs')
const path = require('path')
const {
  CompleteBenchmark,
  SimpleMetricResult,
  Commit,
  BenchmarkInfo
} = require('./types')

module.exports.addCompleteBenchmarkToFile = async (
  benchmarkInstance,
  folderWithBenchData,
  fileWithBenchData,
  evaluationResult,
  evaluationParams,
  evaluationConfig
) => {
  try {
    let jsonData
    const pathToPreviousDataFile = path.join(
        folderWithBenchData, fileWithBenchData
    )
    core.debug('--- start addCompleteBenchmarkToFile ---')
    core.debug(`Reading file at ${pathToPreviousDataFile}`)
    try {
      const data = await fs.readFile(pathToPreviousDataFile, 'utf8')
      jsonData = JSON.parse(data)
    } catch (err) {
      core.debug(
        `Could not find file at ${pathToPreviousDataFile}. Initializing with default data.`
      )
      jsonData = {
        lastUpdate: Date.now(),
        repoUrl: '',
        entries: {}
      }
    }

    jsonData.lastUpdate = Date.now()

    const newBenchmarkJSON = {
      commit: benchmarkInstance.commitInfo,
      date: Date.now(),
      executionTime: benchmarkInstance.benchmarkInfo.executionTime,
      parametrization: benchmarkInstance.benchmarkInfo.parametrization,
      otherInfo: benchmarkInstance.benchmarkInfo.otherInfo,
      metrics: benchmarkInstance.simpleMetricResults.map(metric => ({
        name: metric.name,
        value: metric.value,
        unit: metric.unit
      })),
      benchSuccessful: benchmarkInstance.benchSuccessful,
      evaluation: {
        evaluationConfig: evaluationConfig,
        evaluationParams: evaluationParams,
        evaluationResult: evaluationResult
      }

    }

    core.debug('-- addCompleteBenchmarkToFile -- Benchmark name: ' + benchmarkInstance.benchmarkGroupName)
    if (!jsonData.entries[benchmarkInstance.benchmarkGroupName]) {
      jsonData.entries[benchmarkInstance.benchmarkGroupName] = []
    }
    jsonData.entries[benchmarkInstance.benchmarkGroupName].push(newBenchmarkJSON)

    await fs.writeFile(pathToPreviousDataFile, JSON.stringify(jsonData, null, 4), 'utf8')

    core.debug('Successfully added new benchmark to file')
    core.debug('--- end addCompleteBenchmarkToFile ---')
  } catch (err) {
    console.error('An error occurred:', err)
  }
}

module.exports.getLatestBenchmark = function (
  benchmarkGroupName,
  folderWithBenchData,
  fileNameWithBenchData,
  n,
  successful = false
)  {

  core.debug('--- start getLatestBenchmark ---')

  const sortedBenchmarkData = module.exports.getSortedBenchmarkData(
      folderWithBenchData, fileNameWithBenchData, benchmarkGroupName, n, successful
  )

    const nthLatestBenchmarkData = sortedBenchmarkData[n - 1]
    //core.debug(`nthLatestBenchmarkData.metrics ${JSON.stringify(nthLatestBenchmarkData)}`)
    return convertBenchDataToCompleteBenchmarkInstance(nthLatestBenchmarkData, benchmarkGroupName)

}

module.exports.getCompleteBenchData = function (
    folderWithBenchData,
    fileNameWithBenchData
)  {
  core.debug('--- start getCompleteBenchData ---')
  core.debug('folderWithBenchData: ' + folderWithBenchData)
  core.debug('fileNameWithBenchData: ' + fileNameWithBenchData)
  const filePath = path.join(folderWithBenchData, fileNameWithBenchData)

  try {
    const fileText = fss.readFileSync(filePath, 'utf8')

    const benchmarkData = JSON.parse(fileText)

    if (!benchmarkData || Object.keys(benchmarkData).length === 0) {
      console.error('BENCHMARK_DATA is empty')
      return null
    }

    core.debug('--- end getCompleteBenchData ---')
    return benchmarkData;
  } catch (error) {
      console.error(`There was an error reading the file at ${filePath}.
       If the file exists, it might be empty. The function will return null.`)
      console.error('The actual error was:', error)
      return null
    }
}

function convertBenchDataToCompleteBenchmarkInstance(data, benchmarkGroupName) {
  const exeTime = data.executionTime;
  const parametrization = data.parametrization;
  const otherInfo = data.otherInfo;
  const benchmarkInfo = new BenchmarkInfo(exeTime, parametrization, otherInfo);
  const benchSuccessful = data.benchSuccessful;

  core.debug('-- convertBenchDataToCompleteBenchmarkInstance -- Benchmark name: ' + benchmarkGroupName)
  const simpleMetricResults = data.metrics.map(
      metric => new SimpleMetricResult(metric.name, metric.value, metric.unit)
  );

  const commitInfo = new Commit(
      data.commit.author,
      data.commit.committer,
      data.commit.id,
      data.commit.message,
      data.commit.timestamp,
      data.commit.url
  );

  core.debug('--- end convertBenchDataToCompleteBenchmarkInstance ---')
  return new CompleteBenchmark(
      benchmarkGroupName,
      benchmarkInfo,
      simpleMetricResults,
      commitInfo,
      benchSuccessful
  );
}

module.exports.getNLatestBenchmarks = function (
    benchmarkGroupName,
    folderWithBenchData,
    fileNameWithBenchData,
    n,
    successful = false
) {
  core.debug('--- start getNLatestBenchmarks ---')
  try {
    const sortedBenchmarkData = module.exports.getSortedBenchmarkData(
        folderWithBenchData, fileNameWithBenchData, benchmarkGroupName, n, successful
    )

    const nthLatest = sortedBenchmarkData.slice(0, n).map(data => {
      return convertBenchDataToCompleteBenchmarkInstance(data, benchmarkGroupName);
    });
    core.debug('--- end getNLatestBenchmarks ---')
    return nthLatest;

  } catch (error) {
    console.error('An error occurred:', error);
    return null;
  }
}

module.exports.getSortedBenchmarkData = function (folderWithBenchData, fileNameWithBenchData,
                                                  benchmarkGroupName, n, successful = false) {

  core.debug('--- start getSortedBenchmarkData ---')
  try {
    const benchmarkData = module.exports.getCompleteBenchData(
        folderWithBenchData, fileNameWithBenchData
    );
    if (!benchmarkData.entries.hasOwnProperty(benchmarkGroupName)) {
      console.error(
          'No data available for the given benchmark name:',
          benchmarkGroupName
      );
      return null;
    }

    let sortedBenchmarkData = benchmarkData.entries[benchmarkGroupName].sort(
        (a, b) => b.date - a.date
    );

    if (successful) {
      sortedBenchmarkData = sortedBenchmarkData.filter(entry => entry.benchSuccessful);
    }

    if (sortedBenchmarkData.length < n) {
      console.error(`Less than ${n} ${successful ? 'successful ' : ''}benchmarks available`);
      return null;
    }

    core.debug('--- end getSortedBenchmarkData (before returning) ---')
    return sortedBenchmarkData;
  } catch (error) {
    console.error('An error occurred:', error);
    return null;
  }
}

module.exports.getBenchFromWeekAgo = function (
    benchmarkGroupToCompare, folderWithBenchData, fileNameWithBenchData) {

  core.debug('--- start getBenchFromWeekAgo ---')
  const ONE_WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  let data = module.exports.getCompleteBenchData(
      folderWithBenchData, fileNameWithBenchData
  );

  let benchmarks = data.entries[benchmarkGroupToCompare];
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
    throw new Error(`No benchmark under '${benchmarkGroupToCompare}' is close to one week old.`);
  } else {
    core.debug(`The closest benchmark to one week old under '${benchmarkGroupToCompare}' is: ${closestBenchmark}`);
    core.debug('--- end getBenchFromWeekAgo (before calling convertBenchData... ---')
    return convertBenchDataToCompleteBenchmarkInstance(closestBenchmark, benchmarkGroupToCompare);
  }
}

module.exports.getClosestToOneWeekAgo = function(benchmarkGroupToCompare, folderWithBenchData, fileNameWithBenchData) {

  let data = module.exports.getCompleteBenchData(
      folderWithBenchData, fileNameWithBenchData
  );
  const ONE_WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  if (!data.entries.hasOwnProperty(benchmarkGroupToCompare)) {
    throw new Error(`No such benchmark key: '${benchmarkGroupToCompare}' exists.`);
  }

  let benchmarks = data.entries[benchmarkGroupToCompare];
  if (benchmarks.length === 0) {
    throw new Error(`No benchmarks under '${benchmarkGroupToCompare}'.`);
  }

  let closestBenchmark = null;
  let smallestDifference = Number.MAX_SAFE_INTEGER;

  benchmarks.forEach(benchmark => {
    let benchmarkAge = now - benchmark.date;
    let difference = Math.abs(benchmarkAge - ONE_WEEK_IN_MS);
    if (difference < smallestDifference) {
      smallestDifference = difference;
      closestBenchmark = benchmark;
    }
  });

  if (!closestBenchmark) {
    throw new Error(`No benchmark under '${benchmarkGroupToCompare}' is close to one week old.`);
  } else {
    console.log(`Found a benchmark under '${benchmarkGroupToCompare}' that is closest to one week old.`);
  }
}


module.exports.getBenchmarkOfStableBranch = function (benchmarkGroupToCompare, folderWithBenchData,
                                                      fileNameWithBenchData, latestBenchSha) {

  core.debug('--- start getBenchmarkOfStableBranch ---')
  let data = module.exports.getCompleteBenchData(
        folderWithBenchData, fileNameWithBenchData
    );
  let benchmarks = data.entries[benchmarkGroupToCompare];
  let benchmark = benchmarks.find(benchmark => benchmark.commit.id === latestBenchSha);
  core.debug(`Benchmark of stable branch: ${JSON.stringify(benchmark)}`);

    if (benchmark === undefined) {
        throw new Error(`No benchmark under '${benchmarkGroupToCompare}' with commit sha ${latestBenchSha} found.`);
    } else {
        core.debug(`The benchmark of the stable branch under '${benchmarkGroupToCompare}' is: ${benchmark}`);
        return convertBenchDataToCompleteBenchmarkInstance(benchmark, benchmarkGroupToCompare);
    }
}


