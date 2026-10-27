import { CallsApi, Configuration, Bxml } from 'bandwidth-sdk';
import express from 'express';

const BW_ACCOUNT_ID = process.env.BW_ACCOUNT_ID;
const BW_CLIENT_ID = process.env.BW_CLIENT_ID;
const BW_CLIENT_SECRET = process.env.BW_CLIENT_SECRET;
const BW_VOICE_APPLICATION_ID = process.env.BW_VOICE_APPLICATION_ID;
const BW_NUMBER = process.env.BW_NUMBER;
const USER_NUMBER = process.env.USER_NUMBER;
const BASE_CALLBACK_URL = process.env.BASE_CALLBACK_URL;
const LOCAL_PORT = process.env.LOCAL_PORT;

if([
    BW_ACCOUNT_ID,
    BW_CLIENT_ID,
    BW_CLIENT_SECRET,
    BW_VOICE_APPLICATION_ID,
    BW_NUMBER,
    USER_NUMBER,
    BASE_CALLBACK_URL,
    LOCAL_PORT
].some(item => item === undefined) || !Number.isInteger(Number(LOCAL_PORT))) {
    throw new Error('Please set the environment variables defined in the README');
}

const config = new Configuration({
    clientId: BW_CLIENT_ID,
    clientSecret: BW_CLIENT_SECRET
});

const app = express();
app.use(express.json());

app.post('/callbacks/inbound/voice', async (req, res) => {
    const callback = req.body;
    if (callback?.eventType !== 'initiate') {
        return res.sendStatus(400);
    }

    const body = {
        applicationId: BW_VOICE_APPLICATION_ID,
        to: USER_NUMBER,
        from: BW_NUMBER,
        answerUrl: `${BASE_CALLBACK_URL}/callbacks/outbound/voice`,
        tag: callback.callId
    };

    let response;
    try {
        const callsApi = new CallsApi(config);
        await callsApi.createCall(BW_ACCOUNT_ID, body);

        const speakSentence = new Bxml.SpeakSentence('Hold while we connect you.');
        const ring = new Bxml.Ring({ duration: 30 });
        response = new Bxml.Response([speakSentence, ring]);
    } catch (err) {
        console.error('Failed to create call:', err.message);

        const speakSentence = new Bxml.SpeakSentence('An error occurred. Ending call.');
        const hangup = new Bxml.Hangup();
        response = new Bxml.Response([speakSentence, hangup]);
    }

    res.set('Content-Type', 'application/xml');
    res.status(200).send(response.toBxml());
});

app.post('/callbacks/outbound/voice', async (req, res) => {
    const callback = req.body;
    if (typeof callback !== 'object' || callback === null) {
        return res.sendStatus(400);
    }

    const response = new Bxml.Response();

    switch (callback.eventType) {
        case 'answer': {
            const speakSentence = new Bxml.SpeakSentence('Hold while we connect you. We will begin to bridge you now.');
            const bridge = new Bxml.Bridge(callback.tag);

            response.addVerbs([speakSentence, bridge]);
            break;
        }
        case 'disconnect':
            console.log(`Call ${callback.callId} has disconnected`);
            break;
        default:
            console.log(`Unexpected event type ${callback.eventType} received`);
            break;
    }

    res.set('Content-Type', 'application/xml');
    res.status(200).send(response.toBxml());
});

app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
        return res.sendStatus(400);
    }
    next(err);
});

app.listen(LOCAL_PORT);
