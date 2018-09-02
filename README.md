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

Currently, there are 6 available functions:

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
