//https://www.bitasiaex.com/about/about.html?id=115 api doc
//miner: https://github.com/flufy3d/CoinexMiner/blob/master/CoinexAPI.py

'use strict';

//  ---------------------------------------------------------------------------

const nodeRsa = require('node-rsa');
const Exchange = require('./base/Exchange');
const {
    ExchangeError,
    AuthenticationError,
    InvalidNonce,
    InsufficientFunds,
    InvalidOrder,
    OrderNotFound,
    PermissionDenied
} = require('./base/errors');

//  ---------------------------------------------------------------------------

// const axios = require('axios');
// axios.defaults.baseURL = 'https://www.bitasiabit.com/app/v1';

// const ursa = require('ursa');


module.exports = class bitasiaex extends Exchange {
    describe() {
        return this.deepExtend(super.describe(), {
            'id': 'bitasiaex',
            'name': 'BitAsiaEx',
            'countries': 'VG',
            'has': {
                'fetchOHLCV': true,
                'fetchOrderBook': true,
                'fetchTickers': true,
                'fetchBalance': true,
                'fetchOrder': true,
                'fetchTrades': true,
                'createOrder': true,
                'cancelOrder': true
            },
            'timeframes': {
                '1m': 'M1',
                '5m': 'M5',
                '15m': 'M15',
                '30m': 'M30',
                '1h': 'H1',
                '1d': 'D1',
                '1w': 'W1',
            },
            'urls': {
                'api': 'https://www.bitasiabit.com/app/v1', //'http://61.218.44.10:9160/app/v1',
                'www': 'https://www.bitasiaex.com',
                'doc': 'https://www.bitasiaex.com/about/about.html?id=115',
                'fees': 'https://www.bitasiaex.com/about/about.html?id=3'
            },
            'api': {
                'public': {
                    'get': [
                        'getIndexMarketCus', //fetchMarkets
                        'getMarketCus', //fetchTicker
                        'getFullDepthCus', //fetchOrderBooks
                    ]
                },
                'private': {
                    'get': [],
                    'post': [
                        'entrustSubmitCus', //限价买卖
                        'entrustMarketCus', //市价买卖
                        'entrustBatchCancelCus', //取消订单
                        'userEntrustCus', //查询订单，当前委单 fetchTrades
                        'userEntrustHistoryCus', //历史订单fetchOrders
                        'userEntrustSearchCus', //fetchOrder
                        'userCapitalCus' //账户信息，fetchBalance
                    ]
                }
            }
        })
    };


    async fetchMarkets() {
        let res = await this.publicGetGetIndexMarketCus();
        // await this.fetch('https://www.bitasiabit.com/app/v1/getIndexMarketCus','GET')
        // console.log(JSON.stringify(res))
        if (res['code'] == 200) {
            let result = [];
            let markets = res['data'];
            for (let i = 0; i < markets.length; i++) {
                let market = markets[i];
                let id = market['pairname'];
                let baseId = market['sellshortname'];
                let quoteId = market['buyshortname'];
                let base = baseId.toUpperCase();
                base = this.commonCurrencyCode(base);
                let quote = quoteId.toUpperCase();
                quote = this.commonCurrencyCode(quote);
                let symbol = base + '/' + quote;
                result[symbol] = {};
                let precision = {
                    'price': 8,
                    'amount': 8,
                };
                let limits = {
                    'price': {
                        'min': Math.pow(10, -precision['price']),
                        'max': Math.pow(10, precision['price']),
                    },
                };
                result[symbol] = {
                    'id': id,
                    'symbol': symbol,
                    'base': base,
                    'quote': quote,
                    'active': true,
                    'precision': precision,
                    'timeStamp': res.time,
                    'info': market
                };
            }
            return result;
        }
        // console.log(res)
    };

    async fetchOrderBook(symbol, limit = undefined, params = {}) {
        await this.loadMarkets();
        // console.log()
        let market = this.market(symbol);
        let request = {
            'pairname': market['id'].toLowerCase()
        };
        if (typeof limit !== 'undefined')
            request['limit'] = limit;
        let response = await this.publicGetGetFullDepthCus(this.extend(request, params));
        if (response['code'] == 200) {
            let orderbook = this.parseOrderBook(response['data'], response['time'], 'bids', 'asks', 0, 1);
            return orderbook;
        } else {
            throw new ExchangeError(response.msg);
        }
    };

    async fetchTicker(symbol, params = {}) {
        await this.loadMarkets();
        let market = this.market(symbol);
        let request = {
            'pairname': market['id'].toLowerCase()
        }
        let ticker = await this.publicGetGetMarketCus(
            this.extend(request, params)
        );
        if (ticker['code'] == 200) {
            let time = ticker['time'];
            ticker = ticker.data;
            let base = ticker['sellshortname'];
            let quote = ticker['buyshortname'];
            symbol = (base + '/' + quote).toUpperCase();
            return {
                'symbol': symbol,
                'timestamp': time,
                'hight': ticker['high'],
                'low': ticker['low'],
                'bid': ticker['bid'],
                'ask': ticker['ask'],
                'last': ticker['price'],
                'close': ticker['price'],
                'change': ticker['rose'],
                'total': ticker['total']
            }
        } else {
            throw new ExchangeError(response.msg);
        }
    };

    async fetchBalance() {
        await this.loadMarkets();
        let res = await this.privatePostUserCapitalCus();
        console.log(res.data.wallet);
        if (res['code'] != 200)
            throw new ExchangeError(res['msg']);
        let result = {
            'info': res
        }
        let balances = res['data']['wallet'];
        for (let i = 0; i < balances.length; i++) {
            let balance = balances[i];
            let currency = balance['shortname'];
            let upperCase = currency.toUpperCase();
            upperCase = this.commonCurrencyCode(upperCase);
            let account = this.account();
            account['total'] = parseFloat(balance['total']);
            account['used'] = parseFloat(balance['frozen']);
            account['free'] = account['total'] - account['used'];
            result[currency] = account;
        }
        return this.parseBalance(result)
    };

    async fetchOrder(id, symbol = undefined, params = {}) {
        await this.loadMarkets();
        let market = this.market(symbol);
        let requet = {
            "entrustId": id
        }
        return await this.privatePostUserEntrustSearchCus(requet)
    }

    async fetchOrders(symbol, currentPage = undefined, params = {}) {
        if (!symbol)
            throw new ExchangeError(this.id + ' fetchOrders requires a symbol param');
        await this.loadMarkets();
        let market = this.market(symbol);
        let request = {
            "pairname": market['id'],
            "currentPage ": currentPage
        };
        return await this.privatePostUserEntrustHistoryCus(this.extend(request, params));
    }

    async fetchTrades(symbol = undefined, params = {}) {
          if (!symbol)
              throw new ExchangeError(this.id + ' fetchTrades requires a symbol param');
        await this.loadMarkets();
        let market = this.market(symbol);
        let request = {
            'pairname': market['id']
        };
        return await this.privatePostUserEntrustCus(
            this.extend(request, params)
        );
    };


    parseOrderSide(side) {
        if (side === 'buy')
            return 0;
        if (side === 'sell')
            return 1;
        return side;
    }

    parseOrder(order, market = undefined) {
        let status
    }

    async createOrder(symbol, type, side, amount, price = undefined, params = {}) {
        await this.loadMarkets();
        let market = this.market(symbol);
        let side_code = this.parseOrderSide(side)
        let order = {
            'pairname': market['id'],
            'type': side_code
        }
        let respone;
        if (type.toLowerCase() === 'limit') {
            if (typeof price === 'undefined') {
                throw new InvalidOrder(this.id + ' createOrder method requires a price argument for a ' + type + ' order')
            };
            order['price'] = this.priceToPrecision(symbol, price);
            order['count'] = amount;
            respone = await this.privatePostEntrustSubmitCus(this.extend(order, params));
        }
        if (type.toLowerCase() === 'market') {
            if (side_code == 0) {
                order['amount'] = amount;
            };
            if (side_code == 1) {
                order['count'] = amount;
            };
            respone = await this.privatePostEntrustMarketCus(this.extend(order, params));
        }
        return {
            'entrustId': respone['data'][0]['entrustId'],
            'timestamp': respone['time'],
            'datatime': this.iso8601(respone['time']),
            'lastTradeTimestamp': undefined,
            'symbol': symbol,
            'type': type,
            'side': side,
            'price': price,
            'average': undefined,
            'amount': amount,
            'info': respone
        };
    }

    async cancelOrder(id_list = [], symbol, params = {}) {
        await this.loadMarkets();
        if (!Array.isArray(id_list)) {
            throw new Error('BitAsiaEX cancelOrder method first argument must be an array ..');
        }
        id_list = id_list.join(',');
        let request = {
            "entrustIdList": id_list
        }
        return await this.privatePostEntrustBatchCancelCus(request)
    };

    sign(path, api = 'public', method = 'GET', params = {}, headers = undefined, body = undefined) {
        // console.log(path)
        path = this.implodeParams(path, params);
        let url = this.urls['api'] + '/' + path;
        // console.log(url)
        let query = this.omit(params, this.extractParams(path));
        // let body = {};
        if (api == 'public') {
            if (Object.keys(query).length)
                url += '?' + this.urlencode(query);
        };
        if (api == 'private') {
            this.requiredCredentials['server_public'] = true;
            this.checkRequiredCredentials(); //设法检查server public Key
            //RSA加密param 和 secret=>加密数据RSA-str
            let s_pub = this.server_public;
            // console.log(s_pub)
            const key = new nodeRsa(s_pub, 'public', {
                encryptionScheme: 'pkcs1'
            });
            let tmp = {
                'apiKey': this.apiKey,
                'secretKey': this.secret
            };
            let data_buffer = new Buffer(JSON.stringify(this.extend(tmp, params)));
            let msg = key.encrypt(data_buffer, 'base64');
            //body = apikey + RSA-str 完成
            body = {
                "apiKey": this.apiKey,
                "data": msg
            };
            headers = {
                'Content-Type': 'application/json;charset=utf-8',
            };
        };
        return {
            'url': url,
            'method': method,
            'body': JSON.stringify(body),
            'headers': headers
        };
    }


}
