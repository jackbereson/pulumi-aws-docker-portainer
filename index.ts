import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as docker from "@pulumi/docker";

const config = new pulumi.Config();
const stackName = pulumi.getStack();

// Lấy tên key pair từ cấu hình hoặc sử dụng giá trị mặc định
const keyPairName = config.get("keyPairName") || "my-key-pair";


// Default VPC
const defaultVpc = new aws.ec2.DefaultVpc("defaultVpc");

// Export VPC ID as an output
export const vpcId = defaultVpc.id.get();

// Tạo một EC2 instance
const instance = new aws.ec2.Instance("my-instance", {
    ami: "ami-0c94855ba95c71c99", // AMI ID của Amazon Linux 2
    instanceType: "t2.micro",
    keyName: keyPairName,
    userData: `#!/bin/bash
                sudo yum update -y
                sudo amazon-linux-extras install docker -y
                sudo service docker start
                sudo usermod -a -G docker ec2-user`,
});

// Tạo một Security Group cho instance
const securityGroup = new aws.ec2.SecurityGroup("my-security-group", {
    ingress: [
        {
            protocol: "tcp",
            fromPort: 22,
            toPort: 22,
            cidrBlocks: ["0.0.0.0/0"],
        },
        {
            protocol: "tcp",
            fromPort: 9000,
            toPort: 9000,
            cidrBlocks: ["0.0.0.0/0"],
        },
    ],
});

// Cho phép truy cập vào cổng 9000 của instance
new aws.ec2.SecurityGroupRule("portainer-access", {
    securityGroupId: securityGroup.id,
    type: "ingress",
    fromPort: 9000,
    toPort: 9000,
    protocol: "tcp",
    cidrBlocks: ["0.0.0.0/0"],
});

// Kết nối instance với Security Group
const networkInterface = new aws.ec2.NetworkInterface("my-network-interface", {
    subnetId: aws.ec2.getSubnetIds({ vpcId }).then(subnet => subnet.ids[0]), // Lấy subnet ID đầu tiên
    securityGroups: [securityGroup.id],
});

// Gán Elastic IP cho instance
const elasticIp = new aws.ec2.Eip("my-elastic-ip", {
    instance: instance.id,
});

// Tạo Elastic IP Association
new aws.ec2.EipAssociation("my-eip-association", {
    instanceId: instance.id,
    publicIp: elasticIp.publicIp,
    networkInterfaceId: networkInterface.id,
});

// Triển khai Portainer sử dụng Docker
const portainerImage = new docker.RemoteImage("portainer-image", {
    name: "portainer/portainer-ce",
    pullTriggers: [instance.id], // Đảm bảo instance đã được triển khai trước khi kéo image
});

const portainerContainer = new docker.Container("portainer-container", {
    image: portainerImage.name,
    ports: [{ external: 9000, internal: 9000 }],
});

// Xuất địa chỉ IP công khai của instance
export const publicIp = elasticIp.publicIp;