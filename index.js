const AWSXRay = require('aws-xray-sdk');
const AWS = AWSXRay.captureAWS(require('aws-sdk'));
const async = require('async');
const uuidv4 = require('uuid/v4');
const cloudwatchlogs = new AWS.CloudWatchLogs();
const lambda = new AWS.Lambda();

const functionName = process.env.AWS_LAMBDA_FUNCTION_NAME ? process.env.AWS_LAMBDA_FUNCTION_NAME : 'local-' + (process.env.AWS_ENVIRONMENT ? process.env.AWS_ENVIRONMENT : 'local');
const environment = functionName.split('-')[1];
const requiredHeaderParams = process.env.REQUIRED_HEADER_PARAMS ? process.env.REQUIRED_HEADER_PARAMS.split(',') : [];
const requiredBodyParams = process.env.REQUIRED_BODY_PARAMS ? process.env.REQUIRED_BODY_PARAMS.split(',') : [];
const logGroupName = process.env.CW_LOG_GROUP_NAME ? process.env.CW_LOG_GROUP_NAME : undefined;

var logEvent;
var logContext;
var logMessages;

module.exports = {
  init: function(event, context, callback) {
    console.time(functionName);

    if (event.body && typeof event.body === 'string') {
      event.body = JSON.parse(event.body);
    }

    logEvent = JSON.parse(JSON.stringify(event));
    if (logEvent.body && logEvent.body.password) {
      logEvent.body.password = '*****';
    }
    logContext = context;
    logMessages = [];

    console.info('Received event:', JSON.stringify(logEvent, null, 2));
    console.info('Received context:', JSON.stringify(logContext, null, 2));

    checkRequiredParams(event.headers, event.body, callback)
  },

  callbackResponse: function(statusCode, body, callback) {
    var response = {
      statusCode: statusCode,
      headers: {
        "Access-Control-Allow-Origin" : "*",
        "Access-Control-Allow-Credentials" : true
      },
      body: JSON.stringify(body)
    }

    console.info('Response:', JSON.stringify(response, null, 2));
    console.timeEnd(functionName);

    if (statusCode >= 500) {
      callback(JSON.stringify(response));
    } else {
      callback(undefined, response);
    }

    postMessages();
  },

  invokeLambda: function(functionName, payload, callback, optionalParameters) {
    var params = {
      FunctionName: functionName + '-' + environment,
      Payload: JSON.stringify(payload)
    };

    if (optionalParameters) {
      params = Object.assign({}, params, optionalParameters);
    }

    lambda.invoke(params, function(err, result) {
      if (err) {
        console.log('Error invoking ' + params.FunctionName);
        console.log(JSON.stringify(err, null, 2));
        module.exports.logError(err);
        callback(err);
      } else {
        var payload = JSON.parse(result.Payload);
        var body = JSON.parse(payload.body);
        if (payload.statusCode >= 200 && payload.statusCode < 300) {
          callback(undefined, body);
        } else {
          callback(body);
        }
      }
    });
  },

  logError: function(error, options) {
    if (!error.time) {
      error.time = new Date().toISOString()
    }

    var logMessage = {
      level: 'ERROR',
      time: error.time,
      functionName: functionName
    }

    logMessage = Object.assign({}, error, logMessage);

    if (options) {
      logMessage = Object.assign({}, options, logMessage);
    }

    logMessages.push(logMessage);
  },

  getEnvironment: function() {
    return environment;
  },

  getFunctionName: function() {
    return functionName;
  }
}

var checkRequiredParams = function(headers, body, callback) {
  async.parallel({
    headerParams: function(callback) {
      checkHeaderParams(headers, callback);
    },
    bodyParams: function(callback) {
      checkBodyParams(body, callback);
    }
  }, function(err, results) {
    if (err) {
      callback(err);
    } else {
      callback();
    }
  });
}

var checkHeaderParams = function(headers, callback) {
  if (requiredHeaderParams.length === 0 || (requiredHeaderParams.length === 1 && requiredHeaderParams[0] === '')) {
    callback();
  } else {
    if (!headers) {
      var error = {
        statusCode: 'InvalidParameterException',
        message: 'No headers found in the request',
        statusCode: 400
      }
      callback(error);
    } else {
      checkValues(requiredHeaderParams, headers, callback);
    }
  }
}

var checkBodyParams = function(body, callback) {
  if (requiredBodyParams.length === 0 || (requiredBodyParams.length === 1 && requiredBodyParams[0] === '')) {
    callback();
  } else {
    if (!body) {
      var error = {
        statusCode: 'InvalidParameterException',
        message: 'No body found in the request',
        statusCode: 400
      }
      callback(error);
    } else {
      checkValues(requiredBodyParams, body, callback);
    }
  }
}

var checkValues = function(params, values, callback) {
  async.each(params, function(param, callback) {
    if(!isValue(values[param])) {
      var error = {
        statusCode: 'InvalidParameterException',
        message: param + ' is required',
        statusCode: 400
      }
      callback(error);
    } else {
      callback();
    }
  }, callback);
}

var isValue = function(value) {
  if ((!value && value !== false && value !== 0) || value === '') {
    return false;
  } else {
    return true;
  }
}

var postMessages = function() {
  if (logMessages.length > 0) {
    if (!logGroupName) {
      console.log('No log group available in environment variables, not posting messages');
      console.log('Messages received for logging:');
      console.log(JSON.stringify(logMessages, null, 2));
    } else {
      var logEvents = [];
      async.each(logMessages, function(logMessage, callback) {
        logMessage.event = logEvent;
        logMessage.context = logContext;
        logEvents.push({
          message: JSON.stringify(logMessage, null, 2),
          timestamp: new Date(logMessage.time).getTime()
        });
        callback();
      }, function(err) {
        if (err) {
          console.log('An error occurred processing logmessages');
        } else {
          async.waterfall([
            createLogStream = function(callback) {
              var params = {
                logGroupName: logGroupName,
                logStreamName: functionName + '/' + uuidv4()
              }
              cloudwatchlogs.createLogStream(params, function(err, result) {
                if (err) {
                  console.log('An error occured creating a new log stream');
                  console.log(JSON.stringify(err, null, 2));
                  callback(err);
                } else {
                  callback(undefined, params.logStreamName);
                }
              });
            },
            postMessages = function(logStreamName, callback) {
              var params = {
                logEvents: logEvents,
                logGroupName: logGroupName,
                logStreamName: logStreamName
              }
              cloudwatchlogs.putLogEvents(params, function(err, result) {
                if (err) {
                  console.log('An error occured posting log messages to stream');
                  console.log(JSON.stringify(err, null, 2));
                  callback(err);
                } else {
                  callback();
                }
              });
            }
          ]);
        }
      });
    }
  }
}
