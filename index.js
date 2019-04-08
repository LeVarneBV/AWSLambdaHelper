const AWSXRay = require('aws-xray-sdk');
const AWS = AWSXRay.captureAWS(require('aws-sdk'));
const async = require('async');
const uuidv4 = require('uuid/v4');
const cloudwatchlogs = new AWS.CloudWatchLogs();
const lambda = new AWS.Lambda();
const documentClient = new AWS.DynamoDB.DocumentClient();
const http = AWSXRay.captureHTTPs(require('http'));
const https = AWSXRay.captureHTTPs(require('https'));

const functionName = process.env.AWS_LAMBDA_FUNCTION_NAME ? process.env.AWS_LAMBDA_FUNCTION_NAME : 'local-' + (process.env.AWS_ENVIRONMENT ? process.env.AWS_ENVIRONMENT : 'local');
const environment = functionName.split('-')[1];
const requiredHeaderParams = process.env.REQUIRED_HEADER_PARAMS ? process.env.REQUIRED_HEADER_PARAMS.split(',') : [];
const requiredBodyParams = process.env.REQUIRED_BODY_PARAMS ? process.env.REQUIRED_BODY_PARAMS.split(',') : [];
const logGroupName = process.env.CW_LOG_GROUP_NAME ? process.env.CW_LOG_GROUP_NAME + '-' + environment : undefined;

const secretFilter = /(pass|token)/i
const additionalSecretFilter = process.env.SECRET_RE? new RegExp(process.env.SECRET_RE): false;

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
    if (logEvent.body) {
      logEvent.body.password ? logEvent.body.password = '*****' : undefined;
      logEvent.body.newPassword ? logEvent.body.newPassword = '*****' : undefined;
    }
    logContext = context;
    logMessages = [];

    console.info('Received event:', JSON.stringify(logEvent, hideVulnerableKeys, 2));
    console.info('Received context:', JSON.stringify(logContext, hideVulnerableKeys, 2));

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

    console.info('Response:', JSON.stringify(response, hideVulnerableKeys, 2));
    console.timeEnd(functionName);

    if (statusCode >= 500) {
      callback(JSON.stringify(response));
    } else {
      callback(undefined, response);
    }

    postMessages();
  },

  invokeLambda: function(functionName, payload, callback, optionalParameters) {
    functionName += '-' + environment
    var params = {
      FunctionName: functionName,
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
        if (!result.Payload) {
          callback();
        } else {
          var payload = JSON.parse(result.Payload);
          var body;
          if (payload.body) {
            body = JSON.parse(payload.body);
          }
          if (payload.statusCode >= 200 && payload.statusCode < 300) {
            callback(undefined, body);
          } else {
            callback(body);
          }
        }
      }
    });
  },

  dynamoGet: function(tableName, key, callback) {
    tableName += '-' + environment;
    var params = {
      TableName : tableName,
      Key: key
    };

    documentClient.get(params, function(err, data) {
      if (err) {
        console.log('Error getting item from table: ' + tableName);
        console.log(JSON.stringify(err, null, 2));
        module.exports.logError(err);
        callback(err);
      } else {
        callback(undefined, data.Item);
      }
    });
  },

  dynamoPut: function(tableName, item, callback, conditionExpression, expressionAttributeNames, expressionAttributeValues) {
    tableName += '-' + environment;
    var params = {
      TableName : tableName,
      Item: item
    };

    if (conditionExpression) {
      params.ConditionExpression = conditionExpression;
    }

    if (expressionAttributeNames) {
      params.ExpressionAttributeNames = expressionAttributeNames;
    }

    if (expressionAttributeValues) {
      params.ExpressionAttributeValues = expressionAttributeValues;
    }

    documentClient.put(params, function(err, data) {
      if (err) {
        if (err.code !== 'ConditionalCheckFailedException') {
          console.log('Error putting item on table: ' + tableName);
          console.log(JSON.stringify(err, null, 2));
          module.exports.logError(err);
        }
        callback(err);
      } else {
        callback();
      }
    });
  },

  dynamoUpdate: function(tableName, key, updateExpression, expressionAttributeValues, callback, conditionExpression, expressionAttributeNames) {
    tableName += '-' + environment;
    var params = {
      TableName: tableName,
      Key: key,
      UpdateExpression: updateExpression,
      ReturnValues: 'ALL_NEW'
    };

    if (expressionAttributeNames) {
      params.ExpressionAttributeNames = expressionAttributeNames;
    }

    if (expressionAttributeValues) {
      params.ExpressionAttributeValues = expressionAttributeValues;
    }

    if (conditionExpression) {
      params.ConditionExpression = conditionExpression;
    }

    documentClient.update(params, function(err, data) {
      if (err) {
        if (err.code !== 'ConditionalCheckFailedException') {
          console.log('Error updating item on table: ' + tableName);
          console.log(JSON.stringify(err, null, 2));
          module.exports.logError(err);
        }
        callback(err);
      } else {
        callback(undefined, data.Attributes);
      }
    });
  },

  dynamoQuery: function(tableName, keyConditionExpression, expressionAttributeValues, callback, indexName, lastEvaluatedKey, expressionAttributeNames, attributesToGet, filterExpression) {
    tableName += '-' + environment;
    var params = {
      TableName: tableName,
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeValues: expressionAttributeValues
    };

    if (indexName) {
      params.IndexName = indexName;
    }

    if (expressionAttributeNames) {
      params.ExpressionAttributeNames = expressionAttributeNames;
    }

    if (lastEvaluatedKey) {
      params.ExclusiveStartKey = lastEvaluatedKey;
    }

    if (attributesToGet) {
      params.AttributesToGet = attributesToGet;
    }

    if (filterExpression) {
      params.FilterExpression = filterExpression;
    }

    documentClient.query(params, function(err, data) {
      if (err) {
        console.log('Error query on table: ' + tableName);
        console.log(JSON.stringify(err, null, 2));
        module.exports.logError(err);
        callback(err);
      } else {
        var returnObject = {
          items: data.Items,
          count: data.Count,
          scannedCount: data.ScannedCount,
          lastEvaluatedKey: data.LastEvaluatedKey
        };
        callback(undefined, returnObject);
      }
    });
  },

  dynamoScan: function(tableName, callback, indexName, lastEvaluatedKey, filterExpression, expressionAttributeNames, expressionAttributeValues, attributesToGet) {
    tableName += '-' + environment;
    var params = {
      TableName: tableName
    };

    if (indexName) {
      params.IndexName = indexName;
    }

    if (lastEvaluatedKey) {
      params.ExclusiveStartKey = lastEvaluatedKey;
    }

    if (filterExpression) {
      params.FilterExpression = filterExpression;
    }

    if (expressionAttributeNames) {
      params.ExpressionAttributeNames = expressionAttributeNames;
    }

    if (expressionAttributeValues) {
      params.ExpressionAttributeValues = expressionAttributeValues;
    }

    if (attributesToGet) {
      params.AttributesToGet = attributesToGet;
    }

    documentClient.scan(params, function(err, data) {
      if (err) {
        console.log('Error scan on table: ' + tableName);
        console.log(JSON.stringify(err, null, 2));
        module.exports.logError(err);
        callback(err);
      } else {
        var returnObject = {
          items: data.Items,
          count: data.Count,
          scannedCount: data.ScannedCount,
          lastEvaluatedKey: data.LastEvaluatedKey
        };
        callback(undefined, returnObject);
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

  httpsRequest: function(options, data, callback) {
    var req = https.request(options, function(res) {

      var body = '';
      res.on('data', function(data) {
        body += data;
      });

      res.on('end', function() {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          res.body = body
          callback(undefined, res);
        } else {
          callback(res);
        }
      });

    });

    req.on('error', function(err) {
      console.log('Error requesting api');
      console.log(JSON.stringify(err, null, 2));
      module.exports.logError(err);
      var error = {
        code: 'UnexpectedLambdaException',
        message: 'An unexpected error occured, try again later or contact support',
        statusCode: 500
      }
      callback(error);
    });

    if (data) {
      req.write(data);
    }

    req.end();
  },

  httpRequest: function(options, data, callback) {
    var req = http.request(options, function(res) {

      var body = '';
      res.on('data', function(data) {
        body += data;
      });

      res.on('end', function() {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          res.body = body
          callback(undefined, res);
        } else {
          callback(res);
        }
      });

    });

    req.on('error', function(err) {
      console.log('Error requesting api');
      console.log(JSON.stringify(err, null, 2));
      module.exports.logError(err);
      var error = {
        code: 'UnexpectedLambdaException',
        message: 'An unexpected error occured, try again later or contact support',
        statusCode: 500
      }
      callback(error);
    });

    if (data) {
      req.write(data);
    }

    req.end();
  },

  startXRayRec: function(name, callback) {
    AWSXRay.captureAsyncFunc(name, function(subsegment) {
      var recorder = new XRayRecorder(name, subsegment);
      callback(undefined, recorder);
    });
  },

  getEnvironment: function() {
    return environment;
  },

  getFunctionName: function() {
    return functionName;
  },

  AWS: AWS,

  AWSXRay: AWSXRay
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
        code: 'InvalidParameterException',
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
        code: 'InvalidParameterException',
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
        code: 'InvalidParameterException',
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

var XRayRecorder = function(name, subsegment){
  this.name = name;
  this.subsegment = subsegment;
}

XRayRecorder.prototype.fail = function (error) {
  this.subsegment.addErrorFlag();
  if (error) {
    this.subsegment.addAnnotation(error.code, error.message);
  }
  this.subsegment.close()
}

XRayRecorder.prototype.succeed = function() {
  this.subsegment.addAnnotation('success', 'all tests passed');
  this.subsegment.close();
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
                }
              });
            }
          ]);
        }
      });
    }
  }
}

function hideVulnerableKeys(key, val) {
  if(typeof val === 'string' && secretFilter.test(key))
    return "***"
  if(additionalSecretFilter && additionalSecretFilter.test(key))
    return "***"
  return val
}
