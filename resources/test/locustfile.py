# - example locust file used for load testing
from locust import HttpLocust, TaskSet
import json

head = {
    'content-type': 'application/json'
}

def defs(l):
    # - fire a whole bunch of info through thjs, expect rejection
    payload = {
        "endpoint": {
            "hashname": "iwnzepzsxsswed4cwn5mbkavwi4qu27e7753wfguicexdzdoqoxq"
        },
        "payload": {
            "_id": "tweet-997114751212666880",
           "type": "tweet"
        }
    }
    l.client.post("/dtou/ask_peer", data=json.dumps(payload), headers=head)

def agree(l):
    # - this data may/may not get rejections but is a more accurate test of
    #   pdb and dtou overhead
    payload = {
        "endpoint": "7tssmkqetiqlo7swz3llkkceubnaph2anwop2evlui6pk6pnumea",
        "payload": {
            "type": "tweet",
            "twitterId": "1017867065452126209",
            "conversationId": "1017867065452126209",
            "authorid": "1017541257801891840",
            "author": "dtou_prototype",
            "text": "\n  dtou-thjs 7tssmkqetiqlo7swz3llkkceubnaph2anwop2evlui6pk6pnumea \n\ni\"m a dtou prototype! hello!\n",
            "html": "\n  <p class=\"TweetTextSize TweetTextSize--normal js-tweet-text tweet-text\" lang=\"ht\" data-aria-label-part=\"0\">dtou-thjs 7tssmkqetiqlo7swz3llkkceubnaph2anwop2evlui6pk6pnumea \n\ni\"m a dtou prototype! hello!</p>\n",
            "agreement": {
                "definitions": {},
                "secrets": {},
                "consumer": {}
            },
            "id": "tweet-1017867065452126209"
        },
        "router": "http://52.90.1.84"
    }
    l.client.post("/dtou/ask_peer", data=json.dumps(payload), headers=head)

def router(l):
    l.client.get("/telehash/router")

class UserBehavior(TaskSet):
    tasks = {agree: 1}

class WebsiteUser(HttpLocust):
    # - make simulated users wait for an avg of 5s
    task_set = UserBehavior
    min_wait = 4500
    max_wait = 5500
