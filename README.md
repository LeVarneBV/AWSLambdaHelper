# AWSLambdaHelper
AWS Lambda helper for default functions(e.g. time logging, event/context logging and creating callback object for AWS API Gateway)

This library is designed to work with AWS API Gateway with lambda proxy integration. It is created for handling the most basic functions, like checking required parameters and sending error logs to an AWS CloudWatch Log Group.

## Installation

```
$ npm install @levarne/awslambdahelper

const awsLambdaHelper = require('@levarne/awslambdahelper');
```

## Usage
If you want the library to check for required header/body parameters, set the correct environment variables.

For header params: ``REQUIRED_HEADER_PARAMS=myRequiredHeaderParam1,myRequiredHeaderParam2``

For body params: ``REQUIRED_BODY_PARAMS=myRequiredBodyParam1,myRequiredBodyParam2``

If you want to use the logError method to send error logs to a cloudwatch log group, set the cloudwatch log group name in your environment variables: ``CW_LOG_GROUP_NAME=myLogGroupName``

**Note: The log group name should end with -environment. e.g. myApplication-development**

Available functions:

**Init method:**

```
awsLambdaHelper.init(event, context, callback);
```

The init function will parse the event.body(if any body is available and the available body is a string). It will also log the event as well as the context. Furthermore, this will start tracking time. If there is a password key in the body, this will be logged as *****. If there are required header and/or body parameters available in the environment variables, the init function will check if those parameters are send with the request. **If you use the init method, always use the callbackResponse() method for your lambda function.**

**Callback response method:**

```
awsLambdaHelper.callbackResponse(statusCode, body, callback);
```

The callback response method will return a correct API Gateway response. It will also log the response, finish time tracking and send any available logs to cloudwatch.

**Invoke lambda method:**

```
awsLambdaHelper.invokeLambda(functionName, payload, callback, optionalParameters);
```

The invoke lambda method will invoke the lambda with the specified named, the stage is automatically added(so if your function is called 'my_lambda-development', invoking 'my_lambda' will automatically point to the current stage). If an error occured invoking lambda, it will be logged. If the response status code is not 2XX, the error callback will be unempty.

https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Lambda.html#invoke-property

**Dynamo get method:**

```
awsLambdaHelper.dynamoGet(tableName, key, callback);
```

The dynamo get method will request an item from a dynamo table. If an error occurs, it will automatically log the error. If not, it will return the item requested(check for empty value, since you might request an empty value).

https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB/DocumentClient.html#get-property

**Dynamo put method:**

```
awsLambdaHelper.dynamoPut(tableName, item, callback, conditionExpression, expressionAttributeNames, expressionAttributeValues);
```

The dynamo put method will put an item on a dynamo table. If an error occurs, and the error is not because of the condition expression, it will automatically log the error. If the condition expression is a critical error for your use case, log the error manual. If the put operation succeeds, it will return an empty callback since the put operation has no return value. The most common parameters are tableName and item, this is why the optional parameters are the last parameters of the call.

https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB/DocumentClient.html#put-property

**Dynamo update method:**

```
awsLambdaHelper.dynamoUpdate(tableName, key, updateExpression, callback, expressionAttributeNames, expressionAttributeValues, conditionExpression);
```

The dynamo update method will update an item in a dynamo table. If an error occurs, and the error is not because of the condition expression, it will automatically log the error. If the update operation succeeds, it will return the item as it is after the update operation. The most common parameters are tableName, key and updateExpression, this is why the optional parameters are the last parameters of the call.

https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB/DocumentClient.html#update-property

**Dynamo query method:**

```
awsLambdaHelper.dynamoQuery(tableName, keyConditionExpression, callback, indexName, expressionAttributeNames, expressionAttributeValues, attributesToGet);
```

The dynamo query method will query items in a dynamo table. If an error occurs, it will automatically log the error. If the query operation succeeds, it will return items, count, scannedCount and lastEvaluatedKey. The most common parameters are tableName and keyCondtionExpression, this is why the optional parameters are the last parameters of the call.

https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB/DocumentClient.html#query-property

**Dynamo scan method:**

```
awsLambdaHelper.dynamoScan(tableName, callback, indexName, lastEvaluatedKey, filterExpression, expressionAttributeNames, expressionAttributeValues, attributesToGet);
```

The dynamo scan method will scan items in a dynamo table. If an error occurs, it will automatically log the error. If the scan operation succeeds, it will return items, count, scannedCount and lastEvaluatedKey. The most common parameter is tableName, this is why the optional parameters are the last parameters of the call.

https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB/DocumentClient.html#scan-property

**Log error method:**

```
awsLambdaHelper.logError(myError);
```

This will send a log object to the log group, below is an example where an AWS service responded with an error, this error is converted to a complete error message:

```
{
  "message": "Requested resource not found",
  "code": "ResourceNotFoundException",
  "time": "2018-08-31T12:34:02.038Z",
  "requestId": "VE4NC0MV96RDQNTIRSF8SF4UHFVV4KQNSO5AEMVJF66Q9ASUAAJG",
  "statusCode": 400,
  "retryable": false,
  "retryDelay": 17.04691844117645,
  "level": "ERROR",
  "functionName": "local",
  "event": {
    "body": {
      "echo": "foobar"
    }
  },
  "context": {
    "local": true
  }
}
```

**Https request mehtod:**

```
awsLambdaHelper.httpsRequest(options, data, callback);
```

Use the https options object: https://nodejs.org/api/https.html#https_https_request_options_callback. For POST requests, enter the body in the data parameter. If the request fails, an error will be logged. If the response status is not 2XX, it will callback the complete response object as an error. If the response status is 2XX, it will return the complete response object the success callback parameter.

**Http request method:**

```
awsLambdaHelper.httpRequest(options, data, callback);
```

This method is the same as httpsRequest(above), only for http calls.

**Start XRay recording method:**

```
awsLambdaHelper.startXRayRec(name, callback);
```

This method will initialize a new XRay subsegment. Use this if you want explicit tracing for a part of your lambda function. The callback will return an XRayRecorder. When you are done recording, use ``XRayRecorder.succeed()`` or ``XRayRecorder.fail()``. For the fail call, you can supply an optional error object, where error.code and error.message should be present.

**Get environment method:**

```
awsLambdaHelper.getEnvironment();
```

If the function is deployed, this will return your stage(e.g. if your function is named "get_user-development", it will return "development"). If the function is running locally, and no AWS_ENVIRONMENT is available in the environment variables, this will return "local".

**Get function name method:**

```
awsLambdaHelper.getFunctionName();
```

If the function is deployed, this will return the full function name. If your function is running locally, it will return "local-" followed by the environment variable AWS_ENVIRONMENT. If no AWS_ENVIRONMENT is available in the environment variables, the get function name method will return "local-local".  

**AWS export:**

```
const { AWS } = require('@levarne/awslambdahelper');
```

**AWSXRay export:**

```
const { AWSXRay } = require('@levarne/awslambdahelper');
```

## Simple example

```
const async = require('async');
const awsLambdaHelper = require('@levarne/awslambdahelper');

exports.handler = function(event, context, callback) {

  async.waterfall([
    init = function(callback) {
      awsLambdaHelper.init(event, context, callback);
    },
    doEcho = function(callback) {
      echo(event.body.echo, callback);
    }
  ], function (err, result) {
    if (err) {
      awsLambdaHelper.callbackResponse(err.statusCode, err, callback);
    } else {
      awsLambdaHelper.callbackResponse(200, result, callback);
    }
  });

}

var echo = function(echo, callback) {
  callback(undefined, echo);
}
```
