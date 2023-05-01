// Copyright 2018-2020Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
const AWS = require('aws-sdk');

const ddb = new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10', region: process.env.AWS_REGION });

const { TABLE_NAME } = process.env;

exports.handler = async event => {
  // use connectionId to get the wsTokenId from sender
  let WS_TOKEN = "";
  try {
    let senderConnectionData = await ddb.query({ TableName: process.env.TABLE_NAME,
        KeyConditionExpression: 'connectionId = :connectionId',
        ExpressionAttributeValues: {':connectionId': event.requestContext.connectionId}
      }).promise();
      WS_TOKEN = senderConnectionData['Items'][0]['wsTokenId'];
  } catch (e) {
      console.error(e);
      return { statusCode: 500, body: e.stack };
    }    
  
  // using that wsTokenId, find another connectionId (it is of the receiver)
  let RECEIVER_CONNECTIONS = [];
    try {
      let receiverConnectionData = await ddb.scan({ TableName: process.env.TABLE_NAME,
      FilterExpression: 'wsTokenId = :wsTokenId',
      ExpressionAttributeValues:{':wsTokenId' : WS_TOKEN}
      }).promise();
      RECEIVER_CONNECTIONS = receiverConnectionData['Items'];
    } catch (e) {
      console.error(e);
      return { statusCode: 500, body: e.stack };
    }
  
  // filter receiver_connections. exclude itself from receiving message.
  RECEIVER_CONNECTIONS = RECEIVER_CONNECTIONS.filter((connection) => isOthers(connection, event.requestContext.connectionId));
  
  // send message to that connectionId
  const message = JSON.parse(event.body).data;
  
  const apigwManagementApi = new AWS.ApiGatewayManagementApi({
    apiVersion: '2018-11-29',
    endpoint: event.requestContext.domainName + '/' + event.requestContext.stage
  });
  
  const postCalls = RECEIVER_CONNECTIONS.map(async ({ connectionId }) => {
    try {
      await apigwManagementApi.postToConnection({ ConnectionId: connectionId, Data: message }).promise();
    } catch (e) {
      if (e.statusCode === 410) {
        console.log(`Found stale connection, deleting ${connectionId}`);
        await ddb.delete({ TableName: TABLE_NAME, Key: { connectionId } }).promise();
      } else {
        throw e;
      }
    }
  });

  try {
    await Promise.all(postCalls);
  } catch (e) {
    console.error(e)
    return { statusCode: 500, body: e.stack };
  }

  return { statusCode: 200, body: 'Data sent.' };
};

function isOthers(conn, connectionId) {
  if(conn["connectionId"] === connectionId) {
    return false;
  }
  return true;
}