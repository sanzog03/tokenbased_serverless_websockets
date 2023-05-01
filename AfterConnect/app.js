const AWS = require('aws-sdk');

const ddb = new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10', region: process.env.AWS_REGION });

exports.handler = async event => {
  const wsTokenId = JSON.parse(event.body).wsTokenId;
  const putParams = {
    TableName: process.env.TABLE_NAME,
    Item: {
      connectionId: event.requestContext.connectionId,
      wsTokenId
    }
  };
  try {
    await ddb.put(putParams).promise();
  } catch (err) {
    console.error(err)
    console.error(JSON.stringify(err))
    return { statusCode: 500, body: 'Failed to add ws token: ' + JSON.stringify(err) };
  }

  return { statusCode: 200, body: 'WS token successful Connected.' };
};
