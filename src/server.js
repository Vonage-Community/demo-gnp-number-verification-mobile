import express from 'express';
import { NumberVerificationClient, NumberVerificationResponse } from '@vonage/network-number-verification';
import { v4 as uuidv4 } from 'uuid';
import {readFileSync} from 'fs';

const app = express();
const port = process.env.VCR_PORT || 3000;
const VONAGE_APPLICATION_ID = process.env.VONAGE_APPLICATION_ID;
const VONAGE_APPLICATION_PRIVATE_KEY = process.env.VONAGE_APPLICATION_PRIVATE_KEY;
const REDIRECT_URL = process.env.REDIRECT_URL;

const privateKeyBuff = readFileSync(VONAGE_APPLICATION_PRIVATE_KEY);
const privateKey = privateKeyBuff.toString('utf-8');

// In memory storage for verification requests
const verificationRequests = {};

// If the client doesnt send a state, generate one
const generateVerificationState = () => uuidv4();

const verifyNumber = (client, number) => client.verifyNumber(number);

const getClient = () => new NumberVerificationClient(
  {
    applicationId: VONAGE_APPLICATION_ID,
    privateKey: privateKey
  },
  {
    redirectUrl: REDIRECT_URL || `https://localhost:${port}/step2`
  }
)

app.use(express.json());

app.get('/_/health', async (_, res) => {
  res.sendStatus(200);
});

app.get('/prepStep1', async (req, res) => {
  const number = req.query.number;
  const method = req.query.method || 'number-verification';
  const state = req.query.state || generateVerificationState();

  Object.assign(state, {
    state: state,
    method: method,
    number: number,
    headers: req.headers,
  });

  const redirectUrl = getClient().buildOIDCURL(
    state,
  );

  console.log(redirectUrl);

  res.redirect(redirectUrl);
});

app.get('/step2', async (req, res) => {
  const { code, state } = req.query;

  const verificationRequest = verificationRequests[state];

  if (!verificationRequest) {
    res.status(401).send("Server error - request doesnt exist");
    return;
  }

  const client = getClient();

  const { method } = verificationRequest;

  if (verificationRequest.state !== state) {
    res.status(403).send("State is incorrect!");
    return;
  }

  // Exchange the code for a token
  const { access_token } = await client.exchangeCodeForToken(code);

  let response = {};
  switch (method) {
    case  'number-verification':
      response = await client.verifyPhoneNumber(
        verificationRequest.number,
        access_token
      );
      break;

    default:
      res.status(400).send("Invalid method");
      return;
  }

  // Remove the request from the in memory storage
  delete verificationRequests[state];

  //return step 3 result
  res.json(response);
});

app.listen(port, () => {
  console.log(`App listening on port ${port}`)
});
