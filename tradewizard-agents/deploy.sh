#!/bin/bash
set -e

# TradeWizard Complete Deployment Script
# Provisions EC2 instance and deploys the application in one go

# Configuration
INSTANCE_TYPE="${INSTANCE_TYPE:-t3.micro}"  # Budget-friendly: ~$7.50/month
KEY_NAME="${KEY_NAME:-tradewizard-key}"
SECURITY_GROUP_NAME="tradewizard-sg"
INSTANCE_NAME="tradewizard-agents"
REGION="${AWS_REGION:-us-east-1}"
APP_DIR="/opt/tradewizard"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

echo -e "${GREEN}🚀 TradeWizard Complete Deployment${NC}"
echo "================================"
echo "Instance Type: $INSTANCE_TYPE"
echo "Region: $REGION"
echo ""

# Check if .env.production exists
if [ ! -f ".env.production" ]; then
    log_error ".env.production not found. Please create it before deploying."
    exit 1
fi

# Check AWS CLI
if ! aws sts get-caller-identity &> /dev/null; then
    log_error "AWS CLI not configured. Run 'aws configure' first."
    exit 1
fi

log_info "AWS Account: $(aws sts get-caller-identity --query Account --output text)"

# ============================================================================
# STEP 1: PROVISION EC2 INSTANCE
# ============================================================================
log_step "Step 1/3: Provisioning EC2 Instance"

# Get latest Amazon Linux 2023 AMI
log_info "Finding latest Amazon Linux 2023 AMI..."
AMI_ID=$(aws ec2 describe-images \
    --owners amazon \
    --filters "Name=name,Values=al2023-ami-2023.*-x86_64" \
              "Name=state,Values=available" \
    --query 'Images | sort_by(@, &CreationDate) | [-1].ImageId' \
    --output text \
    --region $REGION)

if [ -z "$AMI_ID" ]; then
    log_error "Could not find Amazon Linux 2023 AMI"
    exit 1
fi
log_info "Using AMI: $AMI_ID"

# Check if key pair exists, create if not
log_info "Checking SSH key pair..."
if ! aws ec2 describe-key-pairs --key-names $KEY_NAME --region $REGION &> /dev/null; then
    log_warn "Key pair '$KEY_NAME' not found. Creating..."
    aws ec2 create-key-pair \
        --key-name $KEY_NAME \
        --query 'KeyMaterial' \
        --output text \
        --region $REGION > ${KEY_NAME}.pem
    chmod 400 ${KEY_NAME}.pem
    log_info "Key pair created and saved to ${KEY_NAME}.pem"
else
    log_info "Key pair '$KEY_NAME' already exists"
fi

# Create security group if it doesn't exist
log_info "Setting up security group..."
SG_ID=$(aws ec2 describe-security-groups \
    --filters "Name=group-name,Values=$SECURITY_GROUP_NAME" \
    --query 'SecurityGroups[0].GroupId' \
    --output text \
    --region $REGION 2>/dev/null || echo "")

if [ "$SG_ID" == "None" ] || [ -z "$SG_ID" ]; then
    log_warn "Security group not found. Creating..."
    SG_ID=$(aws ec2 create-security-group \
        --group-name $SECURITY_GROUP_NAME \
        --description "Security group for TradeWizard agents" \
        --query 'GroupId' \
        --output text \
        --region $REGION)
    
    # Allow SSH
    aws ec2 authorize-security-group-ingress \
        --group-id $SG_ID \
        --protocol tcp \
        --port 22 \
        --cidr 0.0.0.0/0 \
        --region $REGION > /dev/null
    
    # Allow health check port
    aws ec2 authorize-security-group-ingress \
        --group-id $SG_ID \
        --protocol tcp \
        --port 3001 \
        --cidr 0.0.0.0/0 \
        --region $REGION > /dev/null
    
    log_info "Security group created: $SG_ID"
else
    log_info "Using existing security group: $SG_ID"
fi

# Create user data script for instance initialization
cat > user-data.sh << 'EOF'
#!/bin/bash
set -e

# Update system
yum update -y

# Install Docker
yum install -y docker
systemctl start docker
systemctl enable docker
usermod -a -G docker ec2-user

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Install git
yum install -y git

# Create app directory
mkdir -p /opt/tradewizard
chown ec2-user:ec2-user /opt/tradewizard

# Signal completion
touch /var/log/user-data-complete
EOF

# Check if instance already exists
log_info "Checking for existing instance..."
EXISTING_INSTANCE=$(aws ec2 describe-instances \
    --filters "Name=tag:Name,Values=$INSTANCE_NAME" \
              "Name=instance-state-name,Values=running,stopped" \
    --query 'Reservations[0].Instances[0].InstanceId' \
    --output text \
    --region $REGION 2>/dev/null || echo "")

if [ "$EXISTING_INSTANCE" != "None" ] && [ -n "$EXISTING_INSTANCE" ]; then
    log_warn "Instance already exists: $EXISTING_INSTANCE"
    read -p "Do you want to use this instance? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        INSTANCE_ID=$EXISTING_INSTANCE
        log_info "Using existing instance: $INSTANCE_ID"
    else
        log_error "Deployment cancelled"
        exit 1
    fi
else
    # Launch EC2 instance
    log_info "Launching EC2 instance ($INSTANCE_TYPE)..."
    INSTANCE_ID=$(aws ec2 run-instances \
        --image-id $AMI_ID \
        --instance-type $INSTANCE_TYPE \
        --key-name $KEY_NAME \
        --security-group-ids $SG_ID \
        --user-data file://user-data.sh \
        --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$INSTANCE_NAME}]" \
        --block-device-mappings '[{"DeviceName":"/dev/xvda","Ebs":{"VolumeSize":20,"VolumeType":"gp3"}}]' \
        --query 'Instances[0].InstanceId' \
        --output text \
        --region $REGION)

    log_info "Instance launched: $INSTANCE_ID"
    log_info "Waiting for instance to be running..."
    aws ec2 wait instance-running --instance-ids $INSTANCE_ID --region $REGION
fi

# Get instance public IP
PUBLIC_IP=$(aws ec2 describe-instances \
    --instance-ids $INSTANCE_ID \
    --query 'Reservations[0].Instances[0].PublicIpAddress' \
    --output text \
    --region $REGION)

log_info "Instance is running at: $PUBLIC_IP"

# Wait for SSH to be available
log_info "Waiting for SSH to be available..."
for i in {1..30}; do
    if ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -i ${KEY_NAME}.pem ec2-user@$PUBLIC_IP "echo 'SSH ready'" &> /dev/null; then
        log_info "SSH connection established"
        break
    fi
    if [ $i -eq 30 ]; then
        log_error "SSH connection timeout"
        exit 1
    fi
    sleep 10
done

# Wait for user-data script to complete
log_info "Waiting for instance initialization..."
ssh -o StrictHostKeyChecking=no -i ${KEY_NAME}.pem ec2-user@$PUBLIC_IP "while [ ! -f /var/log/user-data-complete ]; do sleep 5; done"

log_info "✅ Instance initialized successfully"

# Clean up user data script
rm -f user-data.sh

# ============================================================================
# STEP 2: PREPARE DEPLOYMENT PACKAGE
# ============================================================================
log_step "Step 2/3: Preparing Deployment Package"

log_info "Creating deployment package..."
tar -czf tradewizard-deploy.tar.gz \
    --exclude='node_modules' \
    --exclude='dist' \
    --exclude='.git' \
    --exclude='*.log' \
    --exclude='.env' \
    package.json \
    package-lock.json \
    Dockerfile \
    docker-compose.yml \
    src/ \
    .env.production

log_info "Copying files to instance..."
scp -o StrictHostKeyChecking=no -i ${KEY_NAME}.pem \
    tradewizard-deploy.tar.gz \
    ec2-user@$PUBLIC_IP:$APP_DIR/

# Clean up local deployment package
rm -f tradewizard-deploy.tar.gz

log_info "✅ Deployment package transferred"

# ============================================================================
# STEP 3: DEPLOY APPLICATION
# ============================================================================
log_step "Step 3/3: Deploying Application"

log_info "Building and starting Docker container..."
ssh -o StrictHostKeyChecking=no -i ${KEY_NAME}.pem ec2-user@$PUBLIC_IP << 'ENDSSH'
set -e

APP_DIR="/opt/tradewizard"
cd $APP_DIR

# Extract deployment package
echo "Extracting files..."
tar -xzf tradewizard-deploy.tar.gz
rm tradewizard-deploy.tar.gz

# Rename .env.production to .env
cp .env.production .env

# Build Docker image
echo "Building Docker image..."
sudo docker build -t tradewizard-agents:latest .

# Stop existing container if running
echo "Stopping existing container..."
sudo docker stop tradewizard-monitor 2>/dev/null || true
sudo docker rm tradewizard-monitor 2>/dev/null || true

# Run new container
echo "Starting new container..."
sudo docker run -d \
    --name tradewizard-monitor \
    --restart unless-stopped \
    --env-file .env \
    -p 3001:3001 \
    tradewizard-agents:latest

# Wait for container to be healthy
echo "Waiting for container to be healthy..."
sleep 10

# Check container status
if sudo docker ps | grep -q tradewizard-monitor; then
    echo "✅ Container is running"
    sudo docker logs --tail 20 tradewizard-monitor
else
    echo "❌ Container failed to start"
    sudo docker logs tradewizard-monitor
    exit 1
fi

# Create systemd service for auto-restart on reboot
echo "Creating systemd service..."
sudo tee /etc/systemd/system/tradewizard.service > /dev/null << 'EOF'
[Unit]
Description=TradeWizard Agents Monitor
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/tradewizard
ExecStart=/usr/bin/docker start tradewizard-monitor
ExecStop=/usr/bin/docker stop tradewizard-monitor
User=ec2-user

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable tradewizard.service

echo "✅ Deployment complete!"
ENDSSH

# Test health endpoint
log_info "Testing health endpoint..."
sleep 5
if curl -f http://$PUBLIC_IP:3001/health &> /dev/null; then
    log_info "✅ Health check passed!"
else
    log_warn "Health check failed. The service might still be starting up."
fi

# Save instance info
cat > instance-info.txt << EOF
INSTANCE_ID=$INSTANCE_ID
INSTANCE_IP=$PUBLIC_IP
REGION=$REGION
KEY_NAME=$KEY_NAME
SECURITY_GROUP_ID=$SG_ID
EOF

echo ""
echo -e "${GREEN}✅ Deployment Complete!${NC}"
echo "================================"
echo "Instance ID: $INSTANCE_ID"
echo "Instance IP: $PUBLIC_IP"
echo "Health Check: http://$PUBLIC_IP:3001/health"
echo ""
echo "Useful commands:"
echo "  View logs: ssh -i ${KEY_NAME}.pem ec2-user@$PUBLIC_IP 'sudo docker logs -f tradewizard-monitor'"
echo "  Restart: ssh -i ${KEY_NAME}.pem ec2-user@$PUBLIC_IP 'sudo docker restart tradewizard-monitor'"
echo "  SSH access: ssh -i ${KEY_NAME}.pem ec2-user@$PUBLIC_IP"
echo ""
echo "To destroy all resources:"
echo "  ./destroy-ec2.sh"
echo ""
echo "Estimated monthly cost: ~\$7.50 (t3.micro, free tier eligible)"
