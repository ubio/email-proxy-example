'use strict';

/* globals OK, DENY, DENYSOFT */

const assert = require('assert');
const util = require('util');
const requestPromise = require('request-promise');
const Address = require('address-rfc2821').Address;

// Stores keys and values from config/email_proxy.ini
let config = {};

exports.register = function () {
    const plugin = this;

    config = plugin.config.get('email_proxy.ini', function () {
        // This closure will be run for each detected update of email_proxy.ini
        // Re-run the outer function again
        plugin.register();
    });

    assert(config.main['api_check_email_url'], 'Invalid email_proxy.ini: api_check_email_url is not defined.');
    assert(config.main['api_forward_params_url'], 'Invalid email_proxy.ini: api_forward_params_url is not defined.');
}

exports.hook_rcpt = function(next, connection, params) {
    return hookRcptAsync(next, connection, params, harakaLogger(this, connection));
};

exports.hook_data_post = function(next, connection) {
    hookDataPostAsync(next, connection, harakaLogger(this, connection));
    return false; // Let haraka know we will call "next" asynchronously
};

function harakaLogger(haraka, connection) {
    assert(
        haraka.loginfo && haraka.logerror && connection,
        'Invalid hook_rcpt context: loginfo, logerror or connection missed.'
    );

    return {
        info: str => haraka.loginfo.bind(haraka)(str, exports, connection),
        error: str => haraka.logerror.bind(haraka)(str, exports, connection),
    };
}

async function hookRcptAsync(next, connection, params, logger) {
    try {
        const [rcpt] = params; // E-mails can have multiple recipients (to, cc, bcc)
        assert(rcpt, 'Invalid hook_rcpt params: rcpt missed.');

        const { user, host } = rcpt;
        assert(user && host, 'Invalid hook_rcpt params: rcpt invalid.');

        const email = `${user}@${host}`;

        // Check if email address exists via request to API
        const { exists } = await requestPromise({
            uri: config.main['api_check_email_url'],
            body: { email },
            method: 'POST',
            json: true,
        });

        if (!exists) {
            logger.info(`hook_rcpt will deny ${email}`);
            next(DENY);
        } else {
            logger.info(`hook_rcpt will accept ${email}`);

            connection.notes.rcpt = rcpt; // pass instance of rcpt to hook_data_post
            connection.transaction.parse_body = true;

            const ok = next(OK);
            return ok;
        }
    } catch (error) {
        logger.error(util.inspect(error));
        next(DENYSOFT);
    };
}

async function hookDataPostAsync(next, connection, logger) {
    try {
        // Get email in EML format (MIME RFC 822)
        const eml = await emlData(connection.transaction.message_stream);

        const { user, host } = connection.notes.rcpt;
        const email = `${user}@${host}`;

        // Let API decide if we should forward email or not,
        // also get original user email from API
        const { forward, forwardTo, from } = await requestPromise({
            uri: config.main['api_forward_params_url'],
            body: { email, eml },
            method: 'POST',
            json: true,
        });

        logger.info(`forward result ${util.inspect({ forward, forwardTo, from })}`);

        if (forward) {
            prepareToForward(connection, { forwardTo, from });
            next(OK);
        } else {
            next(DENY);
        }
    } catch (error) {
        logger.error(util.inspect(error));
        next(DENYSOFT);
    };
}

function prepareToForward(connection, { from, forwardTo }) {
    assert(from && forwardTo, 'Cannot prepare to forward without from and forwardTo');

    const [user, host] = extractEmail(forwardTo).split('@');

    connection.transaction.remove_header('From');
    connection.transaction.add_header('From', from);
    connection.transaction.mail_from = new Address(user, host);
    connection.transaction.remove_header('Reply-To');
    connection.transaction.remove_header('Sender');
    connection.transaction.remove_header('To');
    connection.transaction.add_header('To', forwardTo);

    // rcpt.user@rcpt.host are used by the forward queue plugin
    // make sure connection.notes.rcpt is the same instance as params[0] in hook_rcpt
    connection.notes.rcpt.user = user;
    connection.notes.rcpt.host = host;
}

// Get email in EML format (MIME RFC 822) https://www.w3.org/Protocols/rfc822/
function emlData(stream) {
    return new Promise(resolve => stream.get_data(resolve));
}

function extractEmail(str) {
    if (str.includes('<') && str.includes('>')) {
        let candidate = str.split('<')[1].split('>')[0];
        if (candidate.includes('@')) {
            return candidate;
        }
    }
    return str;
}
