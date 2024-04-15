import boto3
from botocore.config import Config


class Singleton(type):
    _instances = {}

    def __call__(cls, *args, **kwargs):
        if cls not in cls._instances:
            cls._instances[cls] = super(Singleton, cls).__call__(*args, **kwargs)
        return cls._instances[cls]


class Aws(metaclass=Singleton):
    def __init__(self, **kwargs):
        self.session = (
            kwargs["session"] if "session" in kwargs else boto3.session.Session()
        )
        default_config = Config(retries={"max_attempts": 3, "mode": "standard"})
        self.sts = (
            kwargs["sts"]
            if "sts" in kwargs
            else self.session.client("sts", config=default_config)
        )
        self.glue = (
            kwargs["glue"]
            if "glue" in kwargs
            else self.session.client("glue", config=default_config)
        )
        self.athena = (
            kwargs["athena"]
            if "athena" in kwargs
            else self.session.client("athena", config=default_config)
        )
        self.bedrock = (
            kwargs["bedrock-runtime"]
            if "bedrock-runtime" in kwargs
            else self.session.client("bedrock-runtime", config=default_config)
        )
        self.s3 = (
            kwargs["s3"]
            if "s3" in kwargs
            else self.session.client("s3", config=default_config)
        )
